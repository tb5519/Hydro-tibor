const pendingStatuses = new Set([0, 20, 21, 22]);
const labels: Record<number, string> = {
  0: '等待评测…', 1: 'AC · 全部通过', 2: '答案不正确', 3: '运行超时', 4: '内存超限',
  5: '输出超限', 6: '运行错误', 7: '编译错误', 8: '评测暂时出错', 9: '已取消',
  10: '运行异常', 11: '未通过', 20: '正在评测…', 21: '正在编译…', 22: '准备运行…', 30: '已忽略', 31: '格式错误',
};

export interface SolutionRunnerOptions {
  root: HTMLElement;
  canRun: boolean;
  sourceMessageId: string;
  submitUrl: string;
  recordUrl?: string;
  getCode: () => string;
  getLang: () => string;
}

/** A single protected teacher run, entirely separate from the normal editor's
 * store, draft, learner account and record-history subscription. */
export function installSolutionRunner(options: SolutionRunnerOptions) {
  const { root } = options; const win = root.ownerDocument.defaultView!;
  const runButton = root.querySelector<HTMLButtonElement>('[data-solution-run="pretest"],button[data-solution-run]:not([data-solution-run="submit"])');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-solution-submit],[data-solution-run="submit"]');
  const panel = root.querySelector<HTMLElement>('[data-solution-run-panel]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-solution-run-input],[data-solution-test-input]');
  const output = root.querySelector<HTMLElement>('[data-solution-run-output],[data-solution-test-output]');
  const status = root.querySelector<HTMLElement>('[data-solution-run-status]');
  const detail = root.querySelector<HTMLElement>('[data-solution-run-detail]');
  const close = root.querySelector<HTMLButtonElement>('[data-solution-run-close]');
  const lifecycle = new AbortController();
  let disposed = false; let busy = false;
  let submitUrl: URL | null = null; let recordTemplate = '';
  try {
    const candidate = new URL(options.submitUrl, win.location.href);
    if (candidate.origin === win.location.origin && !candidate.username && !candidate.password
      && /\/p\/[^/]+\/submit\/?$/.test(candidate.pathname)) {
      // Never inherit the learner's contest token, query parameters or fragment.
      candidate.search = ''; candidate.hash = ''; submitUrl = candidate;
      recordTemplate = options.recordUrl || `${candidate.pathname.replace(/\/p\/[^/]+\/submit\/?$/, '')}/record/{rid}`;
    }
  } catch { /* A missing/invalid capability disables running rather than sending elsewhere. */ }
  const allowed = options.canRun && !!submitUrl && !!options.sourceMessageId;
  const setStatus = (text: string, state: 'idle' | 'pending' | 'pass' | 'error' = 'idle') => {
    if (status) { status.textContent = text; status.dataset.state = state; }
  };
  function controls() {
    if (runButton) runButton.disabled = !allowed || busy || disposed;
    if (submitButton) submitButton.disabled = !allowed || busy || disposed;
    root.toggleAttribute('data-solution-running', busy);
  }
  const errorText = (error: unknown) => error instanceof Error ? error.message : '暂时无法连接，请重试。';
  async function request(url: URL, body?: any) {
    if (url.origin !== win.location.origin) throw new Error('评测地址无效，请刷新页面。');
    const controller = new AbortController();
    const abort = () => controller.abort();
    lifecycle.signal.addEventListener('abort', abort, { once: true });
    const timer = win.setTimeout(abort, 15000);
    try {
      const response = await win.fetch(url.href, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      let value: any;
      try { value = await response.json(); } catch { throw new Error('连接暂时中断，请稍后重试。'); }
      if (!response.ok || value?.error) {
        const message = value?.error?.message;
        throw Object.assign(new Error(typeof message === 'string' ? message : '暂时无法运行，请稍后重试。'), { status: response.status });
      }
      return value;
    } finally { win.clearTimeout(timer); lifecycle.signal.removeEventListener('abort', abort); }
  }
  const delay = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { win.clearTimeout(timer); lifecycle.signal.removeEventListener('abort', done); resolve(); };
    const timer = win.setTimeout(done, ms);
    lifecycle.signal.addEventListener('abort', done, { once: true });
    if (lifecycle.signal.aborted) done();
  });
  function paintRecord(record: any, pretest: boolean, source: string) {
    const state = Number(record.status); const pending = pendingStatuses.has(state);
    const passed = state === 1;
    setStatus(pretest && passed ? '运行完成' : labels[state] || (pending ? '正在评测…' : '评测结束'), pending ? 'pending' : passed ? 'pass' : 'error');
    const texts = [record.compilerTexts, record.judgeTexts].flatMap((values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
    if (pretest && typeof record.testCases?.[0]?.message === 'string') texts.push(record.testCases[0].message);
    if (output) output.textContent = texts.join('\n').slice(0, 100000) || (pending ? '正在等待运行结果…' : pretest ? '（程序没有输出）' : passed ? '所有测试点均已通过。' : '请检查代码后再试。');
    const parts: string[] = [];
    if (!pretest && Array.isArray(record.testCases) && record.testCases.length) {
      parts.push(`通过 ${record.testCases.filter((test: any) => Number(test.status) === 1).length}/${record.testCases.length}`);
    }
    if (!pending) {
      if (!pretest && typeof record.score === 'number' && Number.isFinite(record.score)) parts.push(`${record.score} 分`);
      if (typeof record.time === 'number' && Number.isFinite(record.time)) parts.push(`${Math.round(record.time)} ms`);
      if (typeof record.memory === 'number' && Number.isFinite(record.memory)) parts.push(`${(record.memory / 1024).toFixed(1)} MB`);
    }
    if (options.getCode() !== source) parts.push('结果对应本次运行的代码');
    if (detail) detail.textContent = parts.join(' · ');
    return !pending;
  }
  async function run(pretest: boolean) {
    if (!allowed || disposed || busy || !submitUrl) return;
    const source = options.getCode(); const lang = options.getLang();
    if (!source.trim()) { setStatus('先写一点代码再运行', 'error'); return; }
    busy = true; controls();
    if (panel) { panel.hidden = false; panel.dataset.mode = pretest ? 'pretest' : 'submit'; }
    if (output) output.textContent = '正在提交…';
    if (detail) detail.textContent = '';
    setStatus(pretest ? '正在运行…' : '正在提交评测…', 'pending');
    try {
      // The server applies the frozen learner's beginner wrapper temporarily.
      // This code string is never expanded or written back into either editor.
      const result = await request(submitUrl, { lang, code: source, source: 'teaching-solution',
        solutionSource: options.sourceMessageId, pretest, ...(pretest ? { input: [input?.value || ''] } : {}) });
      const rid = result?.rid?.$oid || result?.rid || result?.data?.rid;
      if (typeof rid !== 'string' || !/^[a-f0-9]{24}$/i.test(rid)) throw new Error('已提交，但暂时未能取得结果。请稍后查看。');
      const recordUrl = new URL(recordTemplate.replace(/\{rid\}/g, rid), win.location.href);
      if (recordUrl.origin !== win.location.origin || !recordUrl.pathname.endsWith(`/record/${rid}`)) throw new Error('评测结果地址无效，请刷新页面。');
      const started = Date.now(); let failures = 0;
      while (!disposed && Date.now() - started < 10 * 60 * 1000) {
        try {
          const value = await request(recordUrl); if (disposed) return;
          const record = value?.rdoc || value?.data?.rdoc;
          if (!record || String(record._id?.$oid || record._id) !== rid || !Number.isFinite(Number(record.status))) throw new Error('暂时未取得本次评测结果。');
          failures = 0;
          if (paintRecord(record, pretest, source)) return;
        } catch (error) {
          if (disposed) return;
          if ([400, 401, 403].includes((error as any).status) || ++failures >= 5) throw error;
          setStatus('连接恢复中…', 'pending');
        }
        await delay(failures ? Math.min(8000, 1000 * 2 ** failures) : Date.now() - started < 15000 ? 1000 : 2000);
      }
      if (!disposed) setStatus('评测较慢，请稍后查看', 'idle');
    } catch (error) {
      if (!disposed) { setStatus('暂未取得结果', 'error'); if (output) output.textContent = errorText(error); }
    } finally { busy = false; if (!disposed) controls(); }
  }
  runButton?.addEventListener('click', () => { void run(true); }, { signal: lifecycle.signal });
  submitButton?.addEventListener('click', () => { void run(false); }, { signal: lifecycle.signal });
  close?.addEventListener('click', () => { if (panel) panel.hidden = true; }, { signal: lifecycle.signal });
  controls();
  return {
    run,
    dispose() {
      if (disposed) return;
      disposed = true; lifecycle.abort(); busy = false; root.removeAttribute('data-solution-running'); controls();
    },
  };
}
