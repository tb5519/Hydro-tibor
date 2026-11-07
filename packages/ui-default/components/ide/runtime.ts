import { emptyIdeSnapshot, IdeCommand, IdeSnapshot, isIdeRunning, TurtleCommand } from './types';
import { getIdeFontSize, subscribeIdeFontSize } from './fontSize';

export interface IdeRuntimeOptions {
  url: string;
  source: () => { code: string; lang: string };
  socketFactory?: (url: string) => WebSocket;
}
export interface IdeRuntime {
  snapshot(): IdeSnapshot;
  subscribe(listener: (snapshot: IdeSnapshot) => void): () => void;
  command(command: IdeCommand): void;
  dispose(): void;
}
const OUTPUT_LIMIT = 96000;
const DRAW_LIMIT = 12000;
const DRAW_BYTES = 3 * 1024 * 1024;
let activeRuntime: IdeRuntime | null = null;
export function getActiveIdeRuntime() { return activeRuntime; }
export function setActiveIdeRuntime(runtime: IdeRuntime | null) {
  activeRuntime = runtime;
  window.dispatchEvent(new CustomEvent('hydro:ide-runtime-ready'));
}

/** One owner connection. A shared teacher view only forwards commands to this instance. */
export function createIdeRuntime(options: IdeRuntimeOptions): IdeRuntime {
  let state = emptyIdeSnapshot();
  state.fontSize = getIdeFontSize();
  let socket: WebSocket | null = null;
  let sequence = 0;
  let lastServerSequence = -1;
  let disposed = false;
  let pendingRun = false;
  let notifyFrame: number | null = null;
  let outputSize = 0;
  let outputTruncated = false;
  let drawingTruncated = false;
  let drawingBytes = 0;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let draftActivity: { text: string; requestId: number | null } | null = null;
  let lastDraftSentAt = 0;
  const listeners = new Set<(snapshot: IdeSnapshot) => void>();
  const drawing = new Map<number, TurtleCommand>();
  const turtles = new Map<number, TurtleCommand>();
  const emit = () => {
    if (disposed) return;
    state.revision += 1;
    if (notifyFrame !== null) return;
    notifyFrame = requestAnimationFrame(() => {
      notifyFrame = null;
      for (const listener of listeners) listener(state);
    });
  };
  const unsubscribeFont = subscribeIdeFontSize(() => {
    const fontSize = getIdeFontSize();
    if (state.fontSize === fontSize || disposed) return;
    state.fontSize = fontSize;
    emit();
  });
  function output(text: string, stream = 'stdout') {
    if (!text) return;
    if (!state.windows.terminal.visible) state.activeWindow = 'terminal';
    state.windows.terminal.visible = true;
    // A program cannot inject markup into the terminal. Control sequences are not
    // presentation HTML and should not leave unreadable escape characters behind.
    const clean = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x00/g, '');
    const previous = state.output[state.output.length - 1];
    if (previous?.stream === stream) previous.text += clean;
    else state.output.push({ stream, text: clean });
    outputSize += clean.length;
    while (outputSize > OUTPUT_LIMIT && state.output.length) {
      const first = state.output[0];
      const trim = Math.min(first.text.length, outputSize - OUTPUT_LIMIT);
      first.text = first.text.slice(trim);
      outputSize -= trim;
      if (!first.text) state.output.shift();
      outputTruncated = true;
    }
    if (outputTruncated && state.output[0]?.stream !== 'notice') {
      const notice = '较早的输出已收起，保留最近的运行内容。\n';
      state.output.unshift({ stream: 'notice', text: notice });
      outputSize += notice.length;
    }
  }
  const send = (message: any) => {
    if (socket?.readyState !== 1) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  function clearDraftActivity() {
    if (draftTimer !== null) clearTimeout(draftTimer);
    draftTimer = null; draftActivity = null;
  }
  function flushDraftActivity() {
    draftTimer = null;
    const draft = draftActivity; draftActivity = null;
    if (!draft || !state.ready || !isIdeRunning(state.state)
      || (draft.requestId === null ? !state.inputPending : state.request?.id !== draft.requestId)) return;
    if (new TextEncoder().encode(draft.text).length > 16384 || draft.text.includes('\0')) return;
    if (send({ type: 'input-draft', runId: state.runId, seq: ++sequence, text: draft.text })) lastDraftSentAt = Date.now();
  }
  function noteDraftActivity(text: string, requestId: number | null) {
    if (!state.ready || !isIdeRunning(state.state) || (requestId === null ? !state.inputPending : state.request?.id !== requestId)) return;
    draftActivity = { text, requestId };
    const delay = Math.max(0, 1000 - (Date.now() - lastDraftSentAt));
    if (!delay) { clearTimeout(draftTimer); flushDraftActivity(); }
    else if (draftTimer === null) draftTimer = setTimeout(flushDraftActivity, delay);
  }
  const sendRun = () => {
    pendingRun = false;
    if (!state.ready || isIdeRunning(state.state)) return;
    const source = options.source();
    if (!source.code.trim()) { state.message = '先写几行代码，再点击运行'; emit(); return; }
    if (new TextEncoder().encode(source.code).length > 131072) {
      state.message = '代码过长，请控制在 128 KB 以内'; output(`${state.message}\n`, 'stderr'); emit(); return;
    }
    const windows = state.windows;
    clearDraftActivity(); lastDraftSentAt = 0;
    state = { ...emptyIdeSnapshot(), windows, fontSize: getIdeFontSize(), revision: state.revision, ready: true, state: 'starting',
      runId: `ide_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}` };
    state.windows.terminal.visible = false;
    state.windows.graphics.visible = false;
    state.windows.terminal.minimized = false;
    state.windows.graphics.minimized = false;
    drawing.clear(); turtles.clear(); outputSize = 0; outputTruncated = false; drawingTruncated = false; drawingBytes = 0;
    sequence = 0; lastServerSequence = -1;
    send({ type: 'run', runId: state.runId, code: source.code, lang: source.lang });
    emit();
  };
  function connect() {
    if (disposed || socket?.readyState === 0 || socket?.readyState === 1) return;
    state.state = 'connecting'; emit();
    const url = new URL(options.url, location.href);
    url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
    socket = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href);
    socket.onmessage = (event) => {
      // Hydro's heartbeat is a text frame, not a JSON application event. Long
      // input waits and turtle mainloops must keep their single run alive.
      if (event.data === 'ping') { if (socket?.readyState === 1) socket.send('pong'); return; }
      if (event.data === 'pong') return;
      let message: any;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === 'ready') {
        state.ready = true;
        if (state.state === 'connecting') state.state = 'idle';
        if (pendingRun) sendRun();
        emit(); return;
      }
      if (message.runId && message.runId !== state.runId) return;
      if (typeof message.seq === 'number') {
        if (message.seq <= lastServerSequence) return;
        lastServerSequence = message.seq;
      }
      switch (message.type) {
        case 'state':
          if (['starting', 'compiling', 'running', 'waiting-input', 'stopping'].includes(message.state)) state.state = message.state;
          break;
        case 'output': output(String(message.text || ''), message.stream === 'stderr' ? 'stderr' : 'stdout'); break;
        case 'input-request':
          state.inputPending = true; state.state = 'waiting-input'; state.activeWindow = 'terminal';
          state.windows.terminal.visible = true; state.windows.terminal.minimized = false;
          break;
        case 'input-end':
          if (draftActivity?.requestId === null) clearDraftActivity();
          state.inputPending = false; if (state.state === 'waiting-input') state.state = 'running'; break;
        case 'turtle':
          if (Array.isArray(message.commands)) for (const command of message.commands) applyDrawing(command);
          break;
        case 'exit':
          clearDraftActivity();
          state.state = 'finished'; state.inputPending = false; state.request = null;
          state.message = message.reason || (message.exitCode ? `程序结束 · 退出码 ${message.exitCode}` : '运行结束');
          if (message.exitCode || message.status === 'error') output(`\n${state.message}\n`, 'stderr');
          else if (message.status === 'stopped' && message.reason) output(`\n${state.message}\n`, 'notice');
          break;
        case 'error':
          // Input/rate validation can fail while the isolated program is still
          // running. Preserve its Stop action and waiting state in that case.
          if (message.fatal === true || (message.fatal === undefined && !['running', 'waiting-input', 'stopping'].includes(state.state))) {
            state.state = 'finished'; state.inputPending = false; state.request = null;
          }
          state.message = String(message.message || '运行失败，请重试');
          output(`${state.message}\n`, 'stderr'); break;
        default: return;
      }
      emit();
    };
    socket.onclose = () => {
      if (disposed) return;
      clearDraftActivity();
      const running = isIdeRunning(state.state);
      state.ready = false; state.state = 'disconnected'; state.inputPending = false; state.request = null; pendingRun = false;
      state.message = '运行连接已断开，再次点击运行即可重新连接';
      if (running) output('\n运行连接已断开，程序已停止。\n', 'stderr');
      emit();
    };
    socket.onerror = () => { state.message = '暂时无法连接运行环境，请重试'; emit(); };
  }
  const cost = (value: any) => value ? new TextEncoder().encode(JSON.stringify(value)).length : 0;
  function reserveDrawing(next: any, previous: any = null) {
    const nextBytes = drawingBytes + cost(next) - cost(previous);
    if (nextBytes <= DRAW_BYTES && drawing.size + turtles.size + (previous ? 0 : 1) <= DRAW_LIMIT) { drawingBytes = nextBytes; return true; }
    drawingTruncated = true;
    state.primitives = [...drawing.values()]; state.turtles = [...turtles.values()];
    output('绘图内容过多，已停止程序。请缩短循环或清空画布后再试。\n', 'notice');
    send({ type: 'stop', runId: state.runId }); state.state = 'stopping';
    return false;
  }
  function applyDrawing(command: TurtleCommand) {
    if (drawingTruncated) return;
    if (!command || typeof command.op !== 'string') return;
    switch (command.op) {
      case 'screen':
        if (!state.windows.graphics.visible) state.activeWindow = 'graphics';
        state.windows.graphics.visible = true;
        state.screen = { ...state.screen, ...command };
        break;
      case 'turtle': {
        const next = { ...turtles.get(command.id), ...command };
        if (reserveDrawing(next, turtles.get(command.id))) turtles.set(command.id, next);
        break;
      }
      case 'line': case 'polygon': case 'dot': case 'text':
        if (reserveDrawing(command, drawing.get(command.id))) drawing.set(command.id, command);
        break;
      case 'clear':
        for (const [id, item] of drawing) if (command.turtle === undefined || item.turtle === command.turtle) {
          drawingBytes -= cost(item); drawing.delete(id);
        }
        break;
      case 'remove':
        if (Array.isArray(command.ids)) command.ids.forEach((id) => { drawingBytes -= cost(drawing.get(id)); drawing.delete(id); });
        break;
      case 'shape':
        if (reserveDrawing(command.points, state.shapes[command.name])) state.shapes = { ...state.shapes, [command.name]: command.points };
        break;
      case 'request':
        clearDraftActivity(); state.activeWindow = 'graphics'; state.request = command; state.windows.graphics.minimized = false; break;
      case 'update': state.primitives = [...drawing.values()]; state.turtles = [...turtles.values()]; break;
      case 'close': state.windows.graphics.visible = false; break;
      default: break;
    }
  }
  const runtime: IdeRuntime = {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    command(command) {
      if (disposed) return;
      if (command.type === 'run') {
        if (isIdeRunning(state.state)) return;
        if (!state.ready) { pendingRun = true; connect(); } else sendRun();
        return;
      }
      if (command.type === 'window') {
        const win = state.windows[command.window];
        if (!win) return;
        state.activeWindow = command.window;
        const patch = command.patch || {};
        for (const key of ['visible', 'minimized', 'maximized'] as const) if (typeof patch[key] === 'boolean') win[key] = patch[key];
        for (const key of ['x', 'y'] as const) if (Number.isFinite(patch[key])) win[key] = Math.max(0, Math.min(0.98, patch[key]));
        if (Number.isFinite(patch.width)) win.width = Math.max(280, Math.min(1600, patch.width));
        if (Number.isFinite(patch.height)) win.height = Math.max(160, Math.min(1200, patch.height));
        emit(); return;
      }
      if (command.type === 'input-draft') {
        const text = String(command.text).slice(0, command.target === 'dialog' ? 4096 : 16000);
        if (command.target === 'dialog') {
          if (!state.request || state.request.id !== command.requestId || state.request.draft === text) return;
          state.request = { ...state.request, draft: text };
          noteDraftActivity(text, state.request.id);
        } else {
          if (state.inputDraft === text) return;
          state.inputDraft = text; noteDraftActivity(text, null);
        }
        emit(); return;
      }
      if (!isIdeRunning(state.state) || !state.runId || !state.ready) return;
      if (command.type === 'stop') {
        clearDraftActivity();
        send({ type: 'stop', runId: state.runId }); state.state = 'stopping'; emit();
      } else if (command.type === 'input') {
        if (!['running', 'waiting-input'].includes(state.state)) return;
        const text = String(command.text);
        const rejectInput = (message: string) => {
          state.inputDraft = text.slice(0, 16000);
          state.inputErrorSeq += 1;
          state.message = message;
          output(`${message}\n`, 'notice'); emit();
        };
        if (text.length > 16000 || new TextEncoder().encode(`${text}\n`).length > 16384) {
          rejectInput('这行输入太长，请缩短后再发送（最多 16 KB）。'); return;
        }
        if (text.includes('\0')) { rejectInput('输入中包含无法发送的空字符，请删除后再试。'); return; }
        if (!send({ type: 'input', runId: state.runId, seq: ++sequence, text: `${text}\n` })) {
          rejectInput('输入尚未发送，连接恢复后可继续发送。'); return;
        }
        clearDraftActivity();
        output(`${text}\n`, 'stdin'); state.inputDraft = ''; state.inputPending = false;
        if (state.state === 'waiting-input') state.state = 'running';
        emit();
      } else if (command.type === 'turtle-event') {
        send({ type: 'turtle-event', runId: state.runId, seq: ++sequence, event: command.event });
        if (command.event.type === 'response') { clearDraftActivity(); state.request = null; emit(); }
      }
    },
    dispose() {
      unsubscribeFont();
      clearDraftActivity();
      disposed = true; if (notifyFrame !== null) cancelAnimationFrame(notifyFrame);
      if (isIdeRunning(state.state)) send({ type: 'stop', runId: state.runId });
      socket?.close(); listeners.clear();
      if (activeRuntime === runtime) setActiveIdeRuntime(null);
    },
  };
  connect();
  return runtime;
}
