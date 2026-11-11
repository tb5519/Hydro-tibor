import loadMonaco from '../monaco/loader';
import { attachSolutionAnnotations, SolutionAnnotationDocument } from '../solution_annotations';
import { recoverSolutionDraft, SolutionDraftBackup } from './solution_draft';
import { installSolutionRunner } from './solution_run';

interface SolutionContent {
  code: string;
  lang: string;
  annotations: SolutionAnnotationDocument;
  revision?: number;
  updatedAt?: string;
}

export interface SolutionWorkspaceConfig {
  sourceMessageId: string;
  messageId: string;
  apiUrl: string;
  canEdit: boolean;
  draft: SolutionContent;
  standard: SolutionContent | null;
  problemUrl: string;
  submitUrl?: string;
  cppEditorMode?: 'beginner' | 'preset' | 'proficient';
}

const emptyAnnotations = (): SolutionAnnotationDocument => ({ version: 1, text: [], code: [], ink: [] });

/** This model never reads or writes the ordinary scratchpad's draft or store.
 * The student's latest work therefore survives viewing a frozen explanation. */
export async function installSolutionWorkspace(root: HTMLElement, config: SolutionWorkspaceConfig) {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const host = root.querySelector<HTMLElement>('[data-solution-editor]')!;
  const status = root.querySelector<HTMLElement>('[data-solution-status]')!;
  const feedback = root.querySelector<HTMLElement>('[data-solution-feedback]')!;
  const returnLink = root.querySelector<HTMLAnchorElement>('[data-solution-return]');
  if (returnLink) {
    const target = new URL(config.problemUrl || returnLink.href, win.location.href);
    if (target.origin === win.location.origin) {
      target.searchParams.set('scratchpad', '1');
      returnLink.href = target.href;
    }
  }
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-solution-action]')];
  let disposed = false;
  let changed = 0;
  let saved = 0;
  let revision = config.draft.revision || 0;
  let timer = 0;
  let feedbackTimer = 0;
  let busy = false;
  let conflict = false;
  let sendAttempt: { serialized: string; clientId: string } | null = null;
  let standard = config.standard;
  const serverContent = { code: config.draft.code, lang: config.draft.lang, annotations: config.draft.annotations || emptyAnnotations() };
  const backupKey = `onebyone.solution.draft.v1/${(win as any).UserContext?._id}/${config.sourceMessageId}`;
  let initial: SolutionContent = serverContent;
  let recovered = false;
  if (config.canEdit) {
    try {
      const recovery = recoverSolutionDraft<SolutionContent>(win.localStorage.getItem(backupKey), revision, serverContent);
      if (recovery && JSON.stringify(recovery) !== JSON.stringify(serverContent)) { initial = recovery; recovered = true; }
    } catch { /* Server autosave is still available without local storage. */ }
  }
  let base = JSON.stringify(serverContent);
  let pending: string | undefined;
  let activeLang = initial.lang;
  let saveQueue: Promise<void> = Promise.resolve();
  const { monaco } = await loadMonaco([]);
  if (disposed || !root.isConnected) return;
  const language = (lang: string) => (win as any).LANGS?.[lang]?.monaco
    || (/^(cc|cpp|c\.)/.test(lang) ? 'cpp' : /^py/.test(lang) ? 'python' : /^java/.test(lang) ? 'java' : 'plaintext');
  const model = monaco.editor.createModel(initial.code || '', language(activeLang),
    monaco.Uri.parse(`onebyone-teaching://workspace/${config.messageId}/${Date.now()}`));
  root.classList.add('is-ready');
  const editor = monaco.editor.create(host, {
    model, theme: 'vs', readOnly: !config.canEdit, domReadOnly: !config.canEdit,
    automaticLayout: true, minimap: { enabled: false }, fontSize: 17, lineHeight: 27,
    padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false, wordWrap: 'off',
    contextmenu: false, roundedSelection: true, renderWhitespace: 'selection',
    folding: true, lineNumbersMinChars: 3,
  });
  let annotations: ReturnType<typeof attachSolutionAnnotations>;
  const content = (): SolutionContent => ({ code: model.getValue(), lang: activeLang,
    annotations: annotations?.serialize() || initial.annotations || emptyAnnotations() });
  const serialized = () => JSON.stringify(content());
  function announce(text: string, error = false) {
    win.clearTimeout(feedbackTimer);
    feedback.hidden = !text;
    feedback.textContent = text;
    feedback.classList.toggle('is-error', error);
    if (!error) feedbackTimer = win.setTimeout(() => { feedback.hidden = true; }, 4000);
  }
  function renderControls() {
    for (const button of buttons) button.disabled = busy || disposed
      || (button.dataset.solutionAction === 'load-standard' && !standard);
    const load = buttons.find((button) => button.dataset.solutionAction === 'load-standard');
    if (load) load.title = standard ? '加载你为这道题保存的标准题解' : '这道题还没有保存标准题解';
  }
  async function api(operation: string, extra: any) {
    const body = JSON.stringify({ operation, snapshotId: config.sourceMessageId, ...extra });
    const response = await win.fetch(config.apiUrl, { method: 'POST', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body, keepalive: new TextEncoder().encode(body).byteLength < 60000 });
    let result: any;
    try { result = await response.json(); } catch { throw new Error('连接暂时中断，请重试。当前题解仍保留在页面中。'); }
    if (!response.ok || result.error) throw Object.assign(new Error(result.error?.message || '暂时无法保存，请重试。'),
      { status: response.status, code: result.error?.code });
    return result;
  }
  function markChanged() {
    if (!config.canEdit || disposed) return;
    changed++;
    backup();
    status.textContent = '正在保存…';
    win.clearTimeout(timer);
    if (!conflict) timer = win.setTimeout(() => { void flush().catch(() => {}); }, 650);
  }
  function backup() {
    if (!config.canEdit || disposed) return;
    try {
      const value: SolutionDraftBackup<SolutionContent> = { version: 1, revision, base, pending, content: content() };
      win.localStorage.setItem(backupKey, JSON.stringify(value));
    } catch { /* Saving to the server does not depend on local recovery storage. */ }
  }
  function flush() {
    win.clearTimeout(timer);
    const next = saveQueue.catch(() => {}).then(async () => {
      if (!config.canEdit || disposed || saved === changed) return;
      if (conflict) throw new Error('题解已在其他窗口修改，请保留当前内容后刷新。');
      const checkpoint = changed;
      const value = content();
      pending = JSON.stringify(value); backup();
      try {
        const result = await api('solutionSave', { content: value, revision });
        revision = result.draft.revision;
        base = JSON.stringify(value);
        pending = undefined;
        saved = checkpoint;
        if (saved === changed) { try { win.localStorage.removeItem(backupKey); } catch { /* Optional recovery slot. */ } }
        else backup();
        status.textContent = saved === changed ? '草稿已保存' : '正在保存…';
      } catch (error) {
        conflict = (error as any).status === 409;
        status.textContent = '草稿尚未保存';
        announce((error as Error).message, true);
        throw error;
      }
    });
    saveQueue = next;
    return next;
  }
  function attach(initial: SolutionAnnotationDocument) {
    annotations?.dispose();
    annotations = attachSolutionAnnotations({ root, editable: config.canEdit, initial,
      editors: [{ id: 'code', editor }], onChange: markChanged });
  }
  attach(initial.annotations || emptyAnnotations());
  const subscription = model.onDidChangeContent(markChanged);
  const languageLabel = root.querySelector<HTMLElement>('[data-solution-language]');
  const updateLanguage = () => {
    if (languageLabel) languageLabel.textContent = (win as any).LANGS?.[activeLang]?.display || activeLang;
    monaco.editor.setModelLanguage(model, language(activeLang));
  };
  updateLanguage();
  const mode = root.querySelector<HTMLElement>('[data-solution-editor-mode]');
  if (mode && language(activeLang) === 'cpp' && config.cppEditorMode === 'beginner') {
    mode.textContent = '临时新手模式';
    mode.title = '保持学员的无头文件写法，自测和评测时自动补齐运行结构，不改变你的设置';
  }
  const runner = installSolutionRunner({ root, canRun: config.canEdit,
    sourceMessageId: config.sourceMessageId, submitUrl: config.submitUrl || '',
    getCode: () => model.getValue(), getLang: () => activeLang });
  status.textContent = config.canEdit ? '草稿已保存' : '只读题解';
  if (recovered) { markChanged(); announce('已恢复离开页面前的题解草稿。'); }
  renderControls();
  const abort = new AbortController();
  for (const button of buttons) button.addEventListener('click', async () => {
    if (!config.canEdit || busy) return;
    busy = true; renderControls();
    try {
      const action = button.dataset.solutionAction;
      if (action === 'load-standard') {
        const result = await api('solutionStandardLoad', {});
        if (!result.standard) throw new Error('这道题还没有标准题解。');
        standard = result.standard;
        activeLang = standard!.lang;
        model.setValue(standard!.code);
        updateLanguage();
        attach(standard!.annotations);
        markChanged();
        await flush();
        announce('已加载标准题解，可以继续调整后发送。');
      } else if (action === 'save-standard') {
        await flush();
        const result = await api('solutionStandardSave', { content: content(), revision: standard?.revision || 0 });
        standard = result.standard;
        announce('已保存为这道题的标准题解。');
      } else if (action === 'send') {
        await flush();
        const value = serialized();
        if (sendAttempt?.serialized !== value) sendAttempt = { serialized: value,
          clientId: win.crypto.randomUUID().replace(/-/g, '') };
        await api('solutionSend', { content: JSON.parse(value), revision, clientId: sendAttempt.clientId });
        announce('题解已发送，学员可以查看你的代码与标注。');
      }
    } catch (error) { announce((error as Error).message, true); }
    finally { busy = false; renderControls(); }
  }, { signal: abort.signal });
  const visibility = () => { if (doc.visibilityState === 'hidden') void flush().catch(() => {}); };
  doc.addEventListener('visibilitychange', visibility, { signal: abort.signal });
  win.addEventListener('online', () => { void flush().catch(() => {}); }, { signal: abort.signal });
  const controller = {
    editor, serialize: content, flush,
    dispose() {
      if (disposed) return;
      disposed = true; win.clearTimeout(timer); win.clearTimeout(feedbackTimer);
      abort.abort(); runner.dispose(); annotations.dispose(); subscription.dispose(); editor.dispose(); model.dispose();
      if ((win as any).__onebyoneSolutionWorkspace === controller) delete (win as any).__onebyoneSolutionWorkspace;
    },
  };
  (win as any).__onebyoneSolutionWorkspace = controller;
  win.addEventListener('pagehide', (event: PageTransitionEvent) => {
    if (event.persisted) return;
    backup();
    // Unfinished saves have a recovery copy even if the frame is destroyed.
    controller.dispose();
  }, { signal: abort.signal });
  win.addEventListener('pageshow', () => annotations.refresh(), { signal: abort.signal });
  return controller;
}
