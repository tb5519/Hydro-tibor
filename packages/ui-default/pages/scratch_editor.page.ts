import { NamedPage } from 'vj/misc/Page';

interface ScratchEditorConfig {
  workId: string;
  title: string;
  projectUrl: string | null;
  saveUrl: string;
  backUrl: string;
  canSubmit: boolean;
  readOnly: boolean;
  revision: number;
  maxFileSize: number;
}

export default new NamedPage('scratch_editor', () => {
  const config = UiContext.scratchEditor as ScratchEditorConfig;
  const frame = document.querySelector<HTMLIFrameElement>('[data-scratch-frame]');
  const status = document.querySelector<HTMLElement>('[data-scratch-status]');
  if (!config || !frame || !status) return;
  const save = document.querySelector<HTMLButtonElement>('[data-scratch-save]');
  const submit = document.querySelector<HTMLButtonElement>('[data-scratch-submit]');
  const channel = crypto.randomUUID();
  let revision = config.revision;
  let title = config.title;
  let savedTitle = title;
  let dirty = false;
  let loaded = false;
  let pending: string | null = null;
  let pendingSubmit = false;
  let phase: 'idle' | 'exporting' | 'uploading' = 'idle';
  let changes = 0;
  let savedChanges = 0;
  let timeout: ReturnType<typeof setTimeout>;
  const show = (message: string, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
    status.dataset.phase = error ? 'error' : pending ? 'busy' : loaded ? 'done' : 'loading';
  };
  const buttons = () => {
    if (save) save.disabled = !loaded || !!pending;
    if (submit) submit.disabled = !loaded || !!pending;
  };
  const send = (type: string, payload: object = {}, transfer: Transferable[] = []) => {
    frame.contentWindow?.postMessage({ channel, type, ...payload }, '*', transfer);
  };
  const sameOriginUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) throw new Error('编辑器接口地址无效');
    return url.href;
  };
  const finish = () => {
    pending = null;
    phase = 'idle';
    clearTimeout(timeout);
    buttons();
  };
  const saveProject = (shouldSubmit: boolean) => {
    if (!loaded || pending || config.readOnly || (shouldSubmit && !config.canSubmit)) return;
    if (!title || title.length > 120) {
      show('请给作品起一个 1～120 字的名字，再保存。', true);
      return;
    }
    pending = crypto.randomUUID();
    phase = 'exporting';
    pendingSubmit = shouldSubmit;
    savedChanges = changes;
    savedTitle = title;
    buttons();
    show(shouldSubmit ? '正在保存并提交作业…' : '正在保存作品…');
    send('export', { id: pending });
    timeout = setTimeout(() => {
      finish();
      loaded = false;
      buttons();
      show('操作超时，保存结果待确认。请在新标签页检查作品，保留本页以免丢失修改。', true);
    }, 60000);
  };
  save?.addEventListener('click', () => saveProject(false));
  submit?.addEventListener('click', () => saveProject(true));
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    const message = event.data;
    try {
      if (message.type === 'ready' && !loaded) {
        let project: ArrayBuffer | undefined;
        if (config.projectUrl) {
          const response = await fetch(sameOriginUrl(config.projectUrl), { credentials: 'same-origin' });
          if (!response.ok) throw new Error('无法加载作品，请确认仍有此课堂的访问权限。');
          const blob = await response.blob();
          if (blob.size > config.maxFileSize) throw new Error('作品超过文件大小限制。');
          project = await blob.arrayBuffer();
        }
        send('init', { project, title, readOnly: config.readOnly, mode: config.readOnly ? 'player' : 'editor' }, project ? [project] : []);
      } else if (message.type === 'loaded') {
        loaded = true;
        show(config.readOnly ? '作品已打开' : '准备好了，开始创作吧');
        buttons();
      } else if (message.type === 'titleChanged' && loaded && !config.readOnly) {
        if (typeof message.title !== 'string' || message.title.length > 10000) return;
        title = message.title.trim();
        dirty = true;
        changes += 1;
        if (!pending) show('名称已修改，记得保存作品');
      } else if (message.type === 'dirty' && loaded && !config.readOnly) {
        dirty = true;
        changes += 1;
        if (!pending) show('有修改尚未保存，记得点「保存作品」');
      } else if (message.type === 'exported' && pending && phase === 'exporting' && message.id === pending && !config.readOnly) {
        phase = 'uploading';
        clearTimeout(timeout);
        if (!(message.file instanceof ArrayBuffer) || message.file.byteLength > config.maxFileSize) {
          throw new Error('作品超过文件大小限制，未上传。');
        }
        const currentRequest = pending;
        const requestChanges = savedChanges;
        const shouldSubmit = pendingSubmit;
        const form = new FormData();
        form.append('file', new Blob([message.file], { type: 'application/x.scratch.sb3' }), 'project.sb3');
        form.append('revision', String(revision));
        form.append('submit', String(shouldSubmit));
        form.append('title', savedTitle);
        if (typeof message.thumbnail === 'string' && message.thumbnail.length < 2 * 1024 * 1024) {
          form.append('thumbnail', message.thumbnail);
        }
        const response = await fetch(sameOriginUrl(config.saveUrl), {
          method: 'POST', body: form, credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error?.params?.join(' ') || result.error?.message || result.message || '保存失败，请刷新页面检查作品版本后重试。');
        }
        if (!Number.isInteger(result.revision)) throw new Error('保存响应无效，请刷新后检查作品。');
        revision = result.revision;
        dirty = changes !== requestChanges;
        send('saved');
        if (pending === currentRequest) finish();
        show(`${shouldSubmit ? '作业已提交' : '作品已保存'} · 版本 ${revision}${dirty ? '，还有新修改未保存' : ''}`);
      } else if (message.type === 'error') {
        throw new Error(String(message.message || '编辑器操作失败'));
      }
    } catch (error) {
      finish();
      show(error.message || '编辑器操作失败，请重试。', true);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty && !pending) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.querySelector('[data-scratch-back]')?.addEventListener('click', (event) => {
    if ((dirty || pending) && !window.confirm('作品还有未保存的修改，确定离开吗？')) event.preventDefault();
  });
  // A dedicated path keeps the editor's many MB of assets out of ordinary pages.
  frame.src = `/scratch-editor/editor.html?lang=zh-cn#channel=${encodeURIComponent(channel)}`;
});
