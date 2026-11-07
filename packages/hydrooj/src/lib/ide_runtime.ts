import { readFileSync } from 'fs';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';
import WebSocket from 'ws';
import { IdeError, IDE_LANGUAGES, IDE_LIMITS, parseGraphicsLine } from './ide_protocol';
import { IdeWatchdog } from './ide_watchdog';

const MB = 1024 * 1024;
const env = ['PATH=/usr/local/bin:/usr/bin:/bin', 'HOME=/w', 'LANG=C.UTF-8', 'PYTHONIOENCODING=utf-8', 'PYTHONDONTWRITEBYTECODE=1'];
const transport = () => ({ content: readFileSync(join(__dirname, 'ide_runtime/transport.py'), 'utf8') });
const streamFiles = [{ streamIn: true }, { streamOut: true }];
const wrappedArgs = (args: string[]) => ['/usr/bin/python3', '-u', '/w/ide_transport.py', ...args];
type Emit = (message: Record<string, any>) => void;
export function ideSandboxUrl(config?: unknown) {
    const url = new URL(typeof config === 'string' && config ? config : 'http://ide-sandbox:5050');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || url.pathname !== '/') throw new IdeError('UNAVAILABLE', '运行服务配置不正确，请联系老师。');
    return url.origin;
}
export function pythonCopyIn(code: string) {
    return {
        'main.py': { content: code },
        'ide_transport.py': transport(),
        'ide_bootstrap.py': { content: readFileSync(join(__dirname, 'ide_runtime/bootstrap.py'), 'utf8') },
        'turtle.py': { content: readFileSync(join(__dirname, 'ide_runtime/turtle.py'), 'utf8') },
    };
}
export function compileCommand(lang: string, code: string) {
    const language = IDE_LANGUAGES[lang];
    const file = language.family === 'c' ? 'main.c' : 'main.cpp';
    return {
        args: wrappedArgs([language.family === 'c' ? '/usr/bin/gcc' : '/usr/bin/g++', '-O0', '-g0', '-pipe', `-std=${language.standard}`,
            '-o', '/w/main', `/w/${file}`, '-lm']), env,
        tty: true, files: streamFiles,
        copyIn: { [file]: { content: code }, 'ide_transport.py': transport() }, copyOutCached: ['main'], copyOutMax: 16 * MB,
        cpuLimit: 20e9, clockLimit: 45e9, memoryLimit: 256 * MB, stackLimit: 64 * MB, procLimit: 16,
    };
}
export function executeCommand(lang: string, code: string, binary?: string) {
    const python = IDE_LANGUAGES[lang].family === 'python';
    return {
        args: wrappedArgs(python ? ['/usr/bin/python3', '-u', '/w/ide_bootstrap.py', '/w/main.py'] : ['/usr/bin/stdbuf', '-o0', '-e0', '/w/main']),
        env: python ? env : [...env, 'ONEBYONE_IDE_DETECT_STDIN=1'],
        tty: true, files: streamFiles,
        copyIn: python ? pythonCopyIn(code) : { main: { fileId: binary }, 'ide_transport.py': transport() },
        cpuLimit: IDE_LIMITS.cpuSeconds * 1e9, clockLimit: IDE_LIMITS.wallSeconds * 1e9,
        memoryLimit: IDE_LIMITS.memoryBytes, stackLimit: 64 * MB, procLimit: 16,
    };
}

/** Owns one isolated process (and optional compile step). No shell or arbitrary executable is exposed. */
export class IdeRuntime {
    private socket: WebSocket;
    private stopped = false;
    private stopReason = '程序已停止。';
    private finished = false;
    private seq = 0;
    private outputBytes = 0;
    private graphicsBytes = 0;
    private graphicsCount = 0;
    private inputBytes = 0;
    private clientSeq = -1;
    private graphicsBuffer = '';
    private transportBuffer = '';
    private transportBytes = 0;
    private transportDecoder = new StringDecoder('utf8');
    private ready = false;
    private decoders = [new StringDecoder('utf8'), new StringDecoder('utf8'), new StringDecoder('utf8')];
    private pending: Record<string, any>[] = [];
    private flushTimer: ReturnType<typeof setTimeout>;
    private phase: 'compiling' | 'running';
    private binary: string;
    private cancelFallback: () => void;
    private watchdog = new IdeWatchdog((reason) => this.stop(reason));
    /** False means a transport failed before sandbox confirmed process termination. Keep its quota until hard expiry. */
    safeToRelease = true;
    constructor(public readonly runId: string, private host: string, private emit: Emit, private onCompiled = async () => {}) { }

    private send(message: Record<string, any>) { this.emit({ ...message, runId: this.runId, seq: this.seq++ }); }
    private flush() {
        clearTimeout(this.flushTimer); this.flushTimer = null;
        const messages = this.pending; this.pending = [];
        for (const message of messages) this.send(message);
    }
    private enqueue(message: Record<string, any>) {
        const previous = this.pending[this.pending.length - 1];
        if (message.type === 'turtle' && previous?.type === 'turtle' && previous.commands.length < 64) previous.commands.push(...message.commands);
        else if (message.type === 'output' && previous?.type === 'output' && previous.stream === message.stream
            && previous.text.length + message.text.length < 12000) previous.text += message.text;
        else this.pending.push(message);
        if (this.pending.length >= 16) this.flush();
        else this.flushTimer ||= setTimeout(() => {
            try { this.flush(); } catch { this.stop('连接较慢，运行已停止，请重新运行。'); }
        }, 30);
    }
    private output(fd: number, data: Buffer) {
        if (fd === 1 || fd === 2) {
            this.outputBytes += data.length;
            if (this.outputBytes > IDE_LIMITS.outputBytes) throw new IdeError('OUTPUT_LIMIT', '输出内容过多，程序已停止。');
            const text = this.decoders[fd - 1].write(data);
            if (text) this.enqueue({ type: 'output', stream: fd === 1 ? 'stdout' : 'stderr', text });
        } else if (fd === 3) {
            this.graphicsBytes += data.length;
            if (this.graphicsBytes > IDE_LIMITS.graphicsBytes) throw new IdeError('GRAPHICS_LIMIT', '本次绘图内容过多，请简化绘图后重试。');
            this.graphicsBuffer += this.decoders[2].write(data);
            let newline = this.graphicsBuffer.indexOf('\n');
            while (newline >= 0) {
                const line = this.graphicsBuffer.slice(0, newline); this.graphicsBuffer = this.graphicsBuffer.slice(newline + 1);
                if (line.trim()) {
                    if (++this.graphicsCount > IDE_LIMITS.graphicsCommands) throw new IdeError('GRAPHICS_LIMIT', '本次绘图步骤过多，请简化绘图后重试。');
                    const message = parseGraphicsLine(line);
                    if (message.type === 'input-request' || message.type === 'input-end') {
                        this.watchdog.inputWaiting(message.type === 'input-request');
                        this.flush(); this.send(message);
                        this.send({ type: 'state', state: message.type === 'input-request' ? 'waiting-input' : 'running' });
                    } else if (message.type === 'execution-wait') {
                        this.watchdog.executionWaiting(message.waiting);
                    } else if (message.type === 'interaction-wait' || message.type === 'interaction-end') {
                        if (message.type === 'interaction-end' && message.temporary) this.watchdog.interactionCallback();
                        else this.watchdog.interactionWaiting(message.type === 'interaction-wait' ? message.kind : null);
                    } else this.enqueue(message);
                }
                newline = this.graphicsBuffer.indexOf('\n');
            }
            if (Buffer.byteLength(this.graphicsBuffer) > IDE_LIMITS.frameBytes) throw new IdeError('INVALID_GRAPHICS', '绘图数据格式不正确。');
        }
    }
    private transportOutput(data: Buffer) {
        this.transportBytes += data.length;
        if (this.transportBytes > 16 * MB) throw new IdeError('OUTPUT_LIMIT', '运行输出过多，程序已停止。');
        this.transportBuffer += this.transportDecoder.write(data);
        let newline = this.transportBuffer.indexOf('\n');
        while (newline >= 0) {
            const line = this.transportBuffer.slice(0, newline); this.transportBuffer = this.transportBuffer.slice(newline + 1);
            if (line.trim()) {
                if (line.length > 96 * 1024) throw new IdeError('INVALID_GRAPHICS', '运行数据格式不正确。');
                const frame = JSON.parse(line);
                if (!this.ready && frame.ready === true && Object.keys(frame).length === 1) {
                    this.ready = true;
                    if (this.phase === 'running') { this.watchdog.start(); this.send({ type: 'state', state: 'running' }); }
                    newline = this.transportBuffer.indexOf('\n');
                    continue;
                }
                if (![1, 2, 3].includes(frame.fd) || typeof frame.data !== 'string'
                    || !/^[A-Za-z0-9+/]*={0,2}$/.test(frame.data)) throw new IdeError('INVALID_GRAPHICS', '运行数据格式不正确。');
                this.output(frame.fd, Buffer.from(frame.data, 'base64'));
            }
            newline = this.transportBuffer.indexOf('\n');
        }
        if (this.transportBuffer.length > 96 * 1024) throw new IdeError('INVALID_GRAPHICS', '运行数据格式不正确。');
    }
    private stream(command: any, timeout: number): Promise<any> {
        this.ready = false;
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(`${this.host.replace(/^http/, 'ws')}/stream`, { maxPayload: 256 * 1024, handshakeTimeout: 5000 });
            this.socket = socket;
            let settled = false;
            let connected = false;
            let cancelTimer: ReturnType<typeof setTimeout>;
            const done = (error?: Error, result?: any, confirmed = false) => {
                if (settled) return;
                settled = true; clearTimeout(timer); clearTimeout(cancelTimer);
                this.cancelFallback = null;
                if (connected && !confirmed) this.safeToRelease = false;
                socket.removeAllListeners(); socket.on('error', () => {});
                if (socket.readyState === WebSocket.OPEN) socket.close(); else socket.terminate();
                if (this.socket === socket) this.socket = null;
                if (error) reject(error); else resolve(result);
            };
            const timer = setTimeout(() => {
                this.stop('运行时间已到，请重新运行。');
                done(new IdeError('TIME_LIMIT', '运行时间已到，请重新运行。'));
            }, timeout);
            this.cancelFallback = () => {
                cancelTimer ||= setTimeout(() => done(new IdeError('STOPPED', this.stopReason)), 3000);
            };
            socket.on('open', () => {
                connected = true;
                if (this.stopped) { done(new IdeError('STOPPED', this.stopReason), null, true); return; }
                socket.send(Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify({ cmd: [command] }))]));
            });
            socket.on('message', (raw) => {
                try {
                    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
                    if (data[0] === 1) {
                        const response = JSON.parse(data.subarray(1).toString());
                        const results = Array.isArray(response) ? response : response.results;
                        if (!Array.isArray(results)) throw new Error('Invalid result');
                        if (!results[0] || typeof results[0].status !== 'string') {
                            done(new IdeError('UNAVAILABLE', '运行环境暂时不可用，请稍后重试。'), undefined, true); return;
                        }
                        done(undefined, results[0], true);
                    } else if (data[0] === 2 && data.length >= 2 && (data[1] >> 4) === 0) {
                        if (!this.stopped) this.transportOutput(data.subarray(2));
                    }
                    else throw new Error('Invalid stream frame');
                } catch (error) { this.stop(error instanceof IdeError ? error.message : '运行连接出现问题，请重新运行。'); }
            });
            socket.on('error', () => done(new IdeError('UNAVAILABLE', '运行服务暂时无法连接，请稍后重试。')));
            socket.on('close', () => done(new IdeError('DISCONNECTED', '运行连接已断开，请重新运行。')));
        });
    }
    async start(lang: string, code: string) {
        this.send({ type: 'state', state: 'starting' });
        try {
            if (IDE_LANGUAGES[lang].family !== 'python') {
                this.phase = 'compiling'; this.send({ type: 'state', state: 'compiling' });
                const compiled = await this.stream(compileCommand(lang, code), 50_000);
                this.flush();
                this.binary = compiled.fileIds?.main;
                if (this.stopped) throw new IdeError('STOPPED', this.stopReason);
                if (compiled.status !== 'Accepted' || !compiled.fileIds?.main) {
                    this.send({ type: 'exit', status: 'compile-error', exitCode: compiled.exitStatus ?? 1, reason: compiled.status === 'Memory Limit Exceeded' ? '编译使用的内存过多，请简化程序或减少头文件。'
                            : compiled.status === 'Time Limit Exceeded' ? '编译时间超限，请简化程序。' : '编译未通过，请查看上面的提示。' });
                    return;
                }
                await this.onCompiled();
            }
            if (this.stopped) throw new IdeError('STOPPED', this.stopReason);
            this.phase = 'running';
            const result = await this.stream(executeCommand(lang, code, this.binary), (IDE_LIMITS.wallSeconds + 5) * 1000);
            this.flush();
            this.send({ type: 'exit', status: this.stopped ? 'stopped' : result.status === 'Accepted' ? 'finished' : 'failed',
                exitCode: result.exitStatus ?? 1,
                reason: this.stopped ? this.stopReason : result.status === 'Time Limit Exceeded' ? '程序运行时间超限，可能存在死循环。'
                    : result.status === 'Memory Limit Exceeded' ? '程序使用的内存超出限制。'
                        : result.status === 'Accepted' ? '' : `程序已结束：${result.status}` });
        } catch (error) {
            this.flush();
            this.send({ type: 'exit', status: this.stopped ? 'stopped' : 'failed', exitCode: -1,
                reason: this.stopped ? this.stopReason : error instanceof IdeError ? error.message : '运行服务出现问题，请稍后重试。' });
        } finally {
            this.finished = true;
            this.watchdog.dispose();
            clearTimeout(this.flushTimer);
            if (this.binary) {
                await fetch(`${this.host}/file/${encodeURIComponent(this.binary)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) }).catch(() => {});
            }
        }
    }
    input(seq: number, text: string, graphics = false) {
        if (seq <= this.clientSeq || this.finished || this.stopped) return;
        if (!this.ready || this.phase !== 'running' || this.socket?.readyState !== WebSocket.OPEN) throw new IdeError('NOT_RUNNING', '程序尚未准备好接收输入。');
        const data = Buffer.from(text);
        if (this.socket.bufferedAmount > 128 * 1024 || this.inputBytes + data.length > MB) {
            this.stop('输入内容过多，程序已停止。'); throw new IdeError('INPUT_LIMIT', '输入内容过多，程序已停止。');
        }
        this.clientSeq = seq; this.inputBytes += data.length;
        if (!graphics) this.watchdog.inputActivity(text);
        else if (JSON.parse(text).type === 'response') this.watchdog.inputActivity(text, false, true);
        const envelope = JSON.stringify({ fd: graphics ? 4 : 0, data: data.toString('base64') });
        this.socket.send(Buffer.concat([Buffer.from([3, 0]), Buffer.from(`${envelope}\n`)]));
    }
    inputDraft(seq: number, text: string) {
        if (seq <= this.clientSeq || this.finished || this.stopped || !this.ready || this.phase !== 'running') return;
        this.clientSeq = seq;
        this.watchdog.inputActivity(text, true);
    }
    stop(reason = '程序已停止。') {
        if (this.finished || this.stopped) return;
        this.stopped = true; this.stopReason = reason;
        this.watchdog.dispose();
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(Buffer.from([4]));
        this.cancelFallback?.();
    }
}
