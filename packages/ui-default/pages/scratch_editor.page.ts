import { NamedPage } from 'vj/misc/Page';
import { createScratchPresetPicker } from '../utils/scratch-preset-picker';

interface ScratchEditorConfig {
  editorVersion: string;
  workId: string;
  title: string;
  projectUrl: string | null;
  saveUrl: string;
  languageUrl: string | null;
  languageGeneration: number | null;
  locale: string;
  backUrl: string;
  canSubmit: boolean;
  readOnly: boolean;
  saveForStudent: boolean;
  ownerName: string;
  revision: number;
  maxFileSize: number;
  libraryUrl?: string;
}

export default new NamedPage('scratch_editor', () => {
  const config = UiContext.scratchEditor as ScratchEditorConfig;
  const frame = document.querySelector<HTMLIFrameElement>('[data-scratch-frame]');
  const status = document.querySelector<HTMLElement>('[data-scratch-status]');
  if (!config || !frame || !status) return;
  const save = document.querySelector<HTMLButtonElement>('[data-scratch-save]');
  const submit = document.querySelector<HTMLButtonElement>('[data-scratch-submit]');
  let presetBusy = false;
  const teacherSaveDialog = document.querySelector<HTMLDialogElement>('[data-scratch-teacher-save-dialog]');
  const teacherSaveTitle = teacherSaveDialog?.querySelector<HTMLElement>('[data-scratch-teacher-save-title]');
  const teacherSaveConfirm = teacherSaveDialog?.querySelector<HTMLButtonElement>('[data-scratch-teacher-save-confirm]');
  const channel = crypto.randomUUID();
  let revision = config.revision;
  let title = config.title;
  let savedTitle = title;
  let dirty = false;
  let loaded = false;
  let initializing = false;
  let loadFailed = false;
  const loading = document.querySelector<HTMLElement>('[data-scratch-loading]');
  const loadingTitle = document.querySelector<HTMLElement>('[data-scratch-loading-title]');
  const loadingHint = document.querySelector<HTMLElement>('[data-scratch-loading-hint]');
  const progress = document.querySelector<HTMLElement>('[data-scratch-progress]');
  const retry = document.querySelector<HTMLButtonElement>('[data-scratch-retry]');
  const controller = new AbortController();
  const loadStage = (step: number, message: string, hint: string) => {
    if (!loading || loadFailed) return;
    loading.dataset.step = String(step);
    if (loadingTitle) loadingTitle.textContent = message;
    if (loadingHint) loadingHint.textContent = hint;
    progress?.setAttribute('aria-valuenow', String(step));
    progress?.setAttribute('aria-valuetext', `第 ${step} 步，共 3 步：${message}`);
  };
  const failLoading = (message: string) => {
    if (loaded || loadFailed) return;
    loadFailed = true;
    controller.abort();
    clearTimeout(loadTimeout);
    clearTimeout(slowTimeout);
    if (loading) loading.dataset.error = 'true';
    if (loadingTitle) loadingTitle.textContent = '暂时没有打开作品';
    if (loadingHint) loadingHint.textContent = message;
    if (retry) retry.hidden = false;
    if (progress) progress.hidden = true;
  };
  const slowTimeout = setTimeout(() => {
    if (!loaded && !loadFailed && loadingHint) loadingHint.textContent = '第一次打开需要多一点时间，正在认真准备中…';
  }, 25000);
  const loadTimeout = setTimeout(() => failLoading('加载时间有点长，请检查网络后重试。'), 180000);
  retry?.addEventListener('click', () => { if (!loaded) location.reload(); });
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
    if (save) save.disabled = !loaded || !!pending || presetBusy;
    if (submit) submit.disabled = !loaded || !!pending || presetBusy;
  };
  const send = (type: string, payload: object = {}, transfer: Transferable[] = []) => {
    frame.contentWindow?.postMessage({ channel, type, ...payload }, '*', transfer);
  };
  const presetPicker = !config.readOnly && config.libraryUrl ? createScratchPresetPicker({
    libraryUrl: config.libraryUrl, send,
    onBusy: (busy) => { presetBusy = busy; buttons(); },
    onStatus: show,
  }) : null;
  const sameOriginUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) throw new Error('编辑器接口地址无效');
    return url.href;
  };
  let savedLocale = config.locale || 'zh-cn';
  let selectedLocale = savedLocale;
  let localeSequence = 0;
  let savingLocale = false;
  const postLocale = async (locale: string, sequence: number) => {
    if (!config.languageUrl || !config.languageGeneration) throw new Error('语言设置接口不可用');
    const body = new FormData();
    body.append('locale', locale);
    body.append('session', channel);
    body.append('generation', String(config.languageGeneration));
    body.append('sequence', String(sequence));
    return fetch(sameOriginUrl(config.languageUrl), {
      method: 'POST', body, credentials: 'same-origin', keepalive: true,
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
  };
  const persistLocale = async () => {
    if (savingLocale || !config.languageUrl) return;
    savingLocale = true;
    while (selectedLocale !== savedLocale) {
      const locale = selectedLocale;
      const sequence = localeSequence;
      try {
        const response = await postLocale(locale, sequence);
        const result = await response.json();
        if (!response.ok || !result.ok || typeof result.locale !== 'string') throw new Error('语言设置保存失败');
        savedLocale = result.locale;
        if (result.accepted === false) {
          if (!pending) show('其他窗口已更新语言。请刷新本页后再选择，才能保存新的语言设置。', true);
          break;
        }
      } catch {
        if (!pending) show('语言已切换，但设置暂时没能保存。请检查网络，刷新页面后再选择语言。', true);
        break;
      }
    }
    savingLocale = false;
  };
  const finish = () => {
    pending = null;
    phase = 'idle';
    clearTimeout(timeout);
    buttons();
  };
  const saveProject = (shouldSubmit: boolean) => {
    if (!loaded || pending || presetBusy || config.readOnly || (shouldSubmit && (!config.canSubmit || config.saveForStudent))) return;
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
    show(shouldSubmit ? '正在保存并提交作业…' : config.saveForStudent ? '正在代学员保存…' : '正在保存作品…');
    send('export', { id: pending });
    timeout = setTimeout(() => {
      finish();
      loaded = false;
      buttons();
      show('操作超时，保存结果待确认。请在新标签页检查作品，保留本页以免丢失修改。', true);
    }, 60000);
  };
  save?.addEventListener('click', () => {
    if (!config.saveForStudent) {
      saveProject(false);
      return;
    }
    if (!loaded || pending || !teacherSaveDialog) return;
    if (!title || title.length > 120) {
      show('请给作品起一个 1～120 字的名字，再保存。', true);
      return;
    }
    if (teacherSaveTitle) teacherSaveTitle.textContent = title;
    teacherSaveDialog.showModal();
  });
  teacherSaveDialog?.querySelectorAll<HTMLButtonElement>('[data-scratch-teacher-save-cancel]').forEach((button) => {
    button.addEventListener('click', () => teacherSaveDialog?.close());
  });
  teacherSaveDialog?.addEventListener('close', () => save?.focus());
  teacherSaveDialog?.addEventListener('click', (event) => {
    if (event.target !== teacherSaveDialog) return;
    const rect = teacherSaveDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      teacherSaveDialog?.close();
    }
  });
  teacherSaveConfirm?.addEventListener('click', () => {
    teacherSaveDialog?.close();
    saveProject(false);
  });
  submit?.addEventListener('click', () => saveProject(true));
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    const message = event.data;
    if (loaded && pending && message.type === 'openPresetLibrary') {
      show('正在保存作品，完成后再添加老师素材。');
      return;
    }
    if (loaded && !pending && presetPicker?.receive(message)) return;
    try {
      if (message.type === 'ready' && !loaded && !initializing && !loadFailed) {
        initializing = true;
        loadStage(2, '正在打开你的作品', '读取角色、造型和积木…');
        let project: ArrayBuffer | undefined;
        if (config.projectUrl) {
          const response = await fetch(sameOriginUrl(config.projectUrl), { credentials: 'same-origin', signal: controller.signal });
          if (!response.ok) throw new Error('无法加载作品，请确认仍有此课堂的访问权限。');
          const length = Number(response.headers.get('content-length'));
          if (length > config.maxFileSize) throw new Error('作品超过文件大小限制。');
          const blob = await response.blob();
          if (blob.size > config.maxFileSize) throw new Error('作品超过文件大小限制。');
          project = await blob.arrayBuffer();
        }
        if (loadFailed) return;
        loadStage(3, '马上就好', config.readOnly ? '正在布置舞台，准备运行作品…' : '正在布置舞台，马上开始创作…');
        send('init', { project, title, readOnly: config.readOnly, mode: config.readOnly ? 'player' : 'editor' }, project ? [project] : []);
      } else if (message.type === 'loaded' && initializing && !loadFailed) {
        loaded = true;
        clearTimeout(loadTimeout);
        clearTimeout(slowTimeout);
        if (loading) loading.hidden = true;
        document.querySelector<HTMLElement>('[data-scratch-editor]')?.setAttribute('data-loaded', 'true');
        show(config.readOnly ? '作品已打开' : '准备好了，开始创作吧');
        buttons();
      } else if (message.type === 'titleChanged' && loaded && !config.readOnly) {
        if (typeof message.title !== 'string' || message.title.length > 10000) return;
        title = message.title.trim();
        dirty = true;
        changes += 1;
        if (!pending) show('名称已修改，记得保存作品');
      } else if (message.type === 'localeChanged' && loaded && !config.readOnly) {
        if (typeof message.locale !== 'string' || !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(message.locale)) return;
        selectedLocale = message.locale;
        localeSequence += 1;
        void persistLocale();
      } else if (message.type === 'dirty' && loaded && !config.readOnly) {
        dirty = true;
        changes += 1;
        if (!pending) show(`有修改尚未保存，记得点「${config.saveForStudent ? '代学员保存' : '保存作品'}」`);
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
        if (config.saveForStudent) form.append('teacherSave', 'true');
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
        show(`${shouldSubmit ? '作业已提交' : config.saveForStudent ? `已为 ${config.ownerName || '学员'} 保存作品` : '作品已保存'}${dirty ? '，还有新修改未保存' : ''}`);
      } else if (message.type === 'error') {
        throw new Error(String(message.message || '编辑器操作失败'));
      }
    } catch (error) {
      finish();
      if (!loaded) failLoading(error.message || '编辑器加载失败，请重试。');
      else show(error.message || '编辑器操作失败，请重试。', true);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty && !pending && !presetBusy) return;
    event.preventDefault();
    event.returnValue = '';
  });
  // A rapid final choice can still be queued behind an earlier request when
  // the tab closes. Keepalive sends it now; the server ignores older sequence
  // numbers from this editor session if they arrive later.
  window.addEventListener('pagehide', () => {
    if (config.readOnly || !config.languageUrl || (!savingLocale && selectedLocale === savedLocale)) return;
    void postLocale(selectedLocale, localeSequence).catch(() => {});
  });
  document.querySelector('[data-scratch-back]')?.addEventListener('click', (event) => {
    if ((dirty || pending) && !window.confirm('作品还有未保存的修改，确定离开吗？')) event.preventDefault();
  });
  // A dedicated path keeps the editor's many MB of assets out of ordinary pages.
  // Keep v first: older OneByOne service workers bypass URLs containing ?v=.
  frame.src = `/scratch-editor/editor.html?v=${encodeURIComponent(config.editorVersion || 'unavailable')}&lang=${encodeURIComponent(config.locale || 'zh-cn')}#channel=${encodeURIComponent(channel)}`;
});
