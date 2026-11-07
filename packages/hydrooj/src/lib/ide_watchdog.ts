import { performance } from 'perf_hooks';
import { IDE_LIMITS } from './ide_protocol';

interface Clock {
    now(): number;
    after(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
    cancel(timer: ReturnType<typeof setTimeout>): void;
}
const clock: Clock = { now: () => performance.now(), after: setTimeout, cancel: clearTimeout };

/** Pauses the execution budget only for explicit interaction waits, never for output or heartbeats. */
export class IdeWatchdog {
    private executionTimer: ReturnType<typeof setTimeout>;
    private inputTimer: ReturnType<typeof setTimeout>;
    private remaining = IDE_LIMITS.executionSeconds * 1000;
    private activeSince: number | null = null;
    private started = false;
    private disposed = false;
    private stdinWaiting = false;
    private interaction: 'input' | 'events' | null = null;
    private interactionExecuting = false;
    private adapterWaiting: boolean | null = null;
    private draft = '';
    constructor(private stop: (reason: string) => void, private time: Clock = clock) { }

    start() { if (!this.started && !this.disposed) { this.started = true; this.refreshExecution(); } }
    private refreshExecution() {
        if (!this.started || this.disposed) return;
        const waiting = this.adapterWaiting ?? (this.stdinWaiting || (this.interaction && !this.interactionExecuting));
        if (waiting) {
            if (this.activeSince !== null) this.remaining -= Math.max(0, this.time.now() - this.activeSince);
            this.activeSince = null;
            this.time.cancel(this.executionTimer); this.executionTimer = null;
        } else if (this.activeSince === null) {
            this.activeSince = this.time.now();
            this.executionTimer = this.time.after(() => {
                this.dispose();
                this.stop('程序实际执行已达 2 分钟，已自动停止。请检查循环，或分段运行。');
            }, Math.max(0, this.remaining));
        }
    }
    private waitingForInput() { return this.stdinWaiting || this.interaction === 'input'; }
    private renewInput() {
        this.time.cancel(this.inputTimer); this.inputTimer = null;
        if (this.waitingForInput() && !this.disposed) {
            this.inputTimer = this.time.after(() => {
                this.dispose();
                this.stop('已等待输入 5 分钟且没有新的输入操作，程序已自动停止。需要时可重新运行。');
            }, IDE_LIMITS.inputIdleSeconds * 1000);
        }
    }
    inputWaiting(value: boolean) {
        if (this.disposed || this.stdinWaiting === value) return;
        const wasWaiting = this.waitingForInput();
        this.stdinWaiting = value;
        if (wasWaiting !== this.waitingForInput()) { this.draft = ''; this.renewInput(); }
        this.refreshExecution();
    }
    interactionWaiting(value: 'input' | 'events' | null) {
        if (this.disposed) return;
        const wasWaiting = this.waitingForInput();
        this.interaction = value;
        this.interactionExecuting = false;
        if (wasWaiting !== this.waitingForInput()) { this.draft = ''; this.renewInput(); }
        this.refreshExecution();
    }
    interactionCallback() {
        if (this.disposed) return;
        // A timer/click callback must not restart a pending dialog's idle timer.
        this.interactionExecuting = true;
        this.refreshExecution();
    }
    executionWaiting(waiting: boolean) {
        if (this.disposed) return;
        // Python can service a turtle callback inside input(). Its UI input wait
        // stays open, while the actual callback must consume execution time.
        this.adapterWaiting = waiting;
        this.refreshExecution();
    }
    inputActivity(text: string, draft = false, graphics = false) {
        if (this.disposed || !this.waitingForInput()) return;
        // A drawing pointer/key event cannot keep a forgotten terminal input alive.
        if (graphics && this.interaction !== 'input') return;
        if (draft) {
            if (this.draft === text) return;
            this.draft = text;
        } else {
            if (!text.length) return;
            this.draft = '';
        }
        this.renewInput();
    }
    dispose() {
        this.disposed = true;
        this.time.cancel(this.executionTimer); this.time.cancel(this.inputTimer);
        this.executionTimer = null; this.inputTimer = null;
    }
}
