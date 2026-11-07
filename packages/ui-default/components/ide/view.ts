import { createTurtleRenderer } from './graphics';
import { emptyIdeSnapshot, IdeCommand, IdeSnapshot, IdeWindowName, isIdeRunning } from './types';

export interface IdeViewOptions { onCommand: (command: IdeCommand) => void; shared?: boolean }
const labels = { terminal: '运行终端', graphics: '海龟绘图' };
const statusText = {
  idle: '准备就绪', connecting: '正在连接', starting: '正在启动', compiling: '正在编译',
  running: '运行中', 'waiting-input': '等待输入', stopping: '正在停止', finished: '运行结束', disconnected: '连接已断开',
};
function element<T extends keyof HTMLElementTagNameMap>(tag: T, className: string, text = '') {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
}
function button(label: string, glyph: string, action: () => void) {
  const el = element('button', 'ide-window__button', glyph); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
  el.addEventListener('click', action); return el;
}

/** Reused verbatim by the owner and the shared teacher view; this function never runs code. */
export function createIdeView(container: HTMLElement, options: IdeViewOptions) {
  const root = element('div', 'ide-runtime');
  root.dataset.ideRuntime = 'true';
  root.setAttribute('data-live-share-private', '');
  if (options.shared) root.setAttribute('data-live-share-ui', '');
  root.setAttribute('aria-label', '程序运行窗口');
  root.dataset.liveShareCustom = 'ide-runtime';
  container.append(root);
  let state = emptyIdeSnapshot();
  let disposed = false;
  const cleanup: (() => void)[] = [];
  const dock = element('div', 'ide-runtime__dock');
  root.append(dock);
  const sharedRun = button('运行代码', '▷ 运行', () => command({ type: isIdeRunning(state.state) ? 'stop' : 'run' }));
  sharedRun.classList.add('ide-runtime__dock-button', 'ide-runtime__shared-run');
  sharedRun.hidden = !options.shared;
  dock.append(sharedRun);
  const windows = {} as Record<IdeWindowName, ReturnType<typeof makeWindow>>;
  function command(value: IdeCommand) { options.onCommand(value); }
  function makeWindow(name: IdeWindowName) {
    const section = element('section', `ide-window ide-window--${name}`);
    section.dataset.ideWindow = name;
    section.setAttribute('aria-label', labels[name]);
    const titlebar = element('div', 'ide-window__titlebar');
    titlebar.dataset.ideDrag = name;
    const icon = element('span', 'ide-window__icon', name === 'terminal' ? '›_' : '◈');
    const title = element('span', 'ide-window__title', labels[name]);
    const status = element('span', 'ide-window__status'); status.setAttribute('role', 'status');
    const controls = element('div', 'ide-window__controls');
    controls.append(button('收起窗口', '−', () => command({ type: 'window', window: name, patch: { minimized: true } })),
      button('最大化或还原', '□', () => command({ type: 'window', window: name, patch: { maximized: !state.windows[name].maximized } })));
    titlebar.append(icon, title, status, controls);
    const body = element('div', 'ide-window__body');
    const grip = element('div', 'ide-window__resize');
    grip.setAttribute('aria-label', '拖动调整窗口大小'); grip.dataset.ideResize = name;
    section.append(titlebar, body, grip); root.append(section);
    const dockButton = button(`展开${labels[name]}`, name === 'terminal' ? '›_ 终端' : '◈ 绘图',
      () => command({ type: 'window', window: name, patch: { minimized: false } }));
    dockButton.classList.add('ide-runtime__dock-button'); dock.append(dockButton);
    function startDrag(event: PointerEvent, resize: boolean) {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
      if (state.windows[name].maximized) return;
      event.preventDefault(); event.stopPropagation();
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      const bounds = root.getBoundingClientRect();
      const initial = section.getBoundingClientRect();
      const dx = event.clientX; const dy = event.clientY;
      const scaleX = root.clientWidth / (bounds.width || 1);
      const scaleY = root.clientHeight / (bounds.height || 1);
      const move = (e: PointerEvent) => {
        const left = (initial.left - bounds.left + e.clientX - dx) * scaleX;
        const top = (initial.top - bounds.top + e.clientY - dy) * scaleY;
        command({ type: 'window', window: name, patch: resize
          ? { width: initial.width * scaleX + (e.clientX - dx) * scaleX, height: initial.height * scaleY + (e.clientY - dy) * scaleY }
          : { x: left / Math.max(1, root.clientWidth - section.offsetWidth), y: top / Math.max(1, root.clientHeight - section.offsetHeight) } });
      };
      const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
    }
    titlebar.addEventListener('pointerdown', (e) => startDrag(e, false));
    grip.addEventListener('pointerdown', (e) => startDrag(e, true));
    section.addEventListener('pointerdown', () => {
      if (state.activeWindow !== name) command({ type: 'window', window: name, patch: {} });
    });
    return { section, title, body, status, dockButton };
  }
  windows.terminal = makeWindow('terminal'); windows.graphics = makeWindow('graphics');
  const output = element('pre', 'ide-terminal__output'); output.setAttribute('aria-label', '程序输出');
  const form = element('form', 'ide-terminal__input-form');
  const prompt = element('span', 'ide-terminal__prompt', '›'); prompt.setAttribute('aria-hidden', 'true');
  const input = element('input', 'ide-terminal__input'); input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('aria-label', '终端输入'); input.placeholder = '输入内容，按回车继续'; input.maxLength = 16000;
  const submit = element('button', 'ide-terminal__send', '↵'); submit.type = 'submit'; submit.setAttribute('aria-label', '发送输入');
  // Interactive stdin is not a saved form: allow consecutive lines immediately,
  // including Enter's implicit click, without the site's five-second submit lock.
  submit.addEventListener('click', (event) => event.stopPropagation());
  form.append(prompt, input, submit);
  windows.terminal.body.append(output, form);
  let composing = false;
  let pendingDraft: string | null = null;
  let draftRunId = '';
  let inputErrorSeq = 0;
  const sendDraft = () => { pendingDraft = input.value; command({ type: 'input-draft', text: input.value }); };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; sendDraft(); });
  input.addEventListener('input', sendDraft);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (composing || !['running', 'waiting-input'].includes(state.state)) return;
    const text = input.value;
    pendingDraft = ''; input.value = '';
    command({ type: 'input', text });
  });
  const canvasWrap = element('div', 'ide-graphics');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ide-graphics__canvas'); svg.setAttribute('tabindex', '0'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '海龟绘图画布，点击后可使用键盘控制'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  canvasWrap.append(svg); windows.graphics.body.append(canvasWrap);
  const renderer = createTurtleRenderer(svg);
  let downTarget: number | undefined;
  let pointerDown = false;
  let downButton = 1;
  let lastPointerTime = 0;
  function graphicsEvent(event: PointerEvent, action: string) {
    if (!isIdeRunning(state.state)) return;
    const p = renderer.point(event, state); if (!p) return;
    const target = action === 'click' ? Number((event.target as Element).closest('[data-ide-turtle]')?.getAttribute('data-ide-turtle')) || undefined : downTarget;
    if (action === 'click') downTarget = target;
    command({ type: 'turtle-event', event: { type: 'click', ...p, button: downButton, action, ...(target ? { target } : {}) } });
  }
  svg.addEventListener('pointerdown', (event) => {
    event.preventDefault(); svg.focus(); pointerDown = true; downButton = event.button + 1; svg.setPointerCapture(event.pointerId); graphicsEvent(event, 'click');
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointerDown || performance.now() - lastPointerTime < 30) return;
    lastPointerTime = performance.now(); graphicsEvent(event, 'drag');
  });
  svg.addEventListener('pointerup', (event) => { graphicsEvent(event, 'release'); pointerDown = false; });
  svg.addEventListener('pointercancel', () => { pointerDown = false; downTarget = undefined; downButton = 1; });
  svg.addEventListener('contextmenu', (event) => event.preventDefault());
  for (const [eventName, action] of [['keydown', 'down'], ['keyup', 'up']]) svg.addEventListener(eventName, (event: KeyboardEvent) => {
    if (!isIdeRunning(state.state) || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;
    event.preventDefault(); command({ type: 'turtle-event', event: { type: 'key', key: event.key, action } });
  });
  const dialog = element('form', 'ide-graphics__dialog'); dialog.setAttribute('role', 'dialog');
  const dialogTitle = element('strong', 'ide-graphics__dialog-title');
  const dialogPrompt = element('label', 'ide-graphics__dialog-prompt');
  const dialogInput = element('input', 'ide-graphics__dialog-input'); dialogInput.maxLength = 4096;
  const dialogButtons = element('div', 'ide-graphics__dialog-buttons');
  const cancel = button('取消输入', '取消', () => respond(null));
  const accept = element('button', 'ide-graphics__dialog-accept', '确定'); accept.type = 'submit';
  accept.addEventListener('click', (event) => event.stopPropagation());
  dialogButtons.append(cancel, accept); dialogPrompt.append(dialogInput); dialog.append(dialogTitle, dialogPrompt, dialogButtons);
  windows.graphics.body.append(dialog);
  function respond(value: string | number | null) {
    if (!state.request) return;
    command({ type: 'turtle-event', event: { type: 'response', id: state.request.id, value } });
  }
  dialog.addEventListener('submit', (event) => {
    event.preventDefault(); if (!dialog.reportValidity()) return;
    respond(state.request?.kind === 'number' ? Number(dialogInput.value) : dialogInput.value);
  });
  let requestId: number | null = null;
  let outputKey = '';
  let wasWaiting = false;
  function layout() {
    if (disposed) return;
    const width = root.clientWidth; const height = root.clientHeight;
    for (const name of ['terminal', 'graphics'] as const) {
      const config = state.windows[name]; const win = windows[name];
      win.section.hidden = !config.visible || config.minimized;
      win.dockButton.hidden = !config.visible || !config.minimized;
      const w = config.maximized ? width : Math.min(config.width, width);
      const h = config.maximized ? height : Math.min(config.height, height);
      win.section.style.width = `${Math.max(1, w)}px`; win.section.style.height = `${Math.max(1, h)}px`;
      win.section.style.left = `${config.maximized ? 0 : config.x * Math.max(0, width - w)}px`;
      win.section.style.top = `${config.maximized ? 0 : config.y * Math.max(0, height - h)}px`;
      win.section.classList.toggle('is-maximized', config.maximized);
      win.section.classList.toggle('is-front', state.activeWindow === name);
    }
  }
  const observer = new ResizeObserver(layout); observer.observe(root); cleanup.push(() => observer.disconnect());
  function render(next: IdeSnapshot) {
    state = next;
    root.dataset.ideState = state.state;
    sharedRun.textContent = isIdeRunning(state.state) ? '■ 停止' : '▷ 运行';
    sharedRun.title = isIdeRunning(state.state) ? '停止学员的程序' : '运行学员的代码';
    sharedRun.setAttribute('aria-label', sharedRun.title);
    layout();
    for (const win of Object.values(windows)) win.status.textContent = statusText[state.state] || '';
    windows.graphics.title.textContent = state.screen.title || '海龟绘图';
    const key = state.runId + state.output.map((part) => `${part.stream}:${part.text}`).join('');
    if (key !== outputKey) {
      const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 64;
      output.replaceChildren(...state.output.map((part) => element('span', `ide-terminal__${part.stream}`, part.text)));
      outputKey = key;
      if (atBottom) output.scrollTop = output.scrollHeight;
    }
    if (draftRunId !== state.runId || inputErrorSeq !== state.inputErrorSeq) {
      pendingDraft = null; draftRunId = state.runId; inputErrorSeq = state.inputErrorSeq;
    }
    if (pendingDraft === state.inputDraft) pendingDraft = null;
    if (!composing && pendingDraft === null && input.value !== state.inputDraft) input.value = state.inputDraft;
    form.hidden = !['running', 'waiting-input'].includes(state.state);
    form.classList.toggle('is-waiting', state.inputPending);
    input.placeholder = state.inputPending ? '程序正在等你输入，按回车继续' : '输入内容，按回车发送';
    // A newly awaited line can be answered immediately, without another click.
    // Never take focus away from the code editor while the user is typing there.
    if (state.inputPending && !wasWaiting && (document.activeElement === document.body || windows.terminal.section.contains(document.activeElement))) input.focus({ preventScroll: true });
    wasWaiting = state.inputPending;
    renderer.render(state);
    dialog.hidden = !state.request;
    const standaloneRequest = !!state.request && !state.windows.graphics.visible;
    const dialogParent = standaloneRequest ? root : windows.graphics.body;
    if (dialog.parentElement !== dialogParent) dialogParent.append(dialog);
    dialog.classList.toggle('ide-graphics__dialog--standalone', standaloneRequest);
    if (state.request && state.request.id !== requestId) {
      requestId = state.request.id;
      dialogTitle.textContent = state.request.title || '请输入';
      dialogPrompt.replaceChildren(document.createTextNode(state.request.prompt || ''), dialogInput);
      dialogInput.type = state.request.kind === 'number' ? 'number' : 'text';
      dialogInput.step = 'any'; dialogInput.required = state.request.kind === 'number';
      dialogInput.min = state.request.min === undefined ? '' : String(state.request.min);
      dialogInput.max = state.request.max === undefined ? '' : String(state.request.max);
      dialogInput.value = state.request.default === undefined ? '' : String(state.request.default);
      dialogInput.setAttribute('aria-label', state.request.prompt || '输入内容');
      dialogInput.focus({ preventScroll: true });
    }
    if (!state.request) requestId = null;
  }
  render(state);
  return { render, getBounds: () => root.getBoundingClientRect(), element: root,
    dispose() { disposed = true; cleanup.forEach((f) => f()); root.remove(); } };
}
