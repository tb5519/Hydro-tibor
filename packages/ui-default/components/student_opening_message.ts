interface OpeningMessage {
  title: string;
  content: string;
  revision: string;
  enabled: boolean;
  updatedAt?: string;
  acknowledgedAt?: string;
}

/** A teacher's draft and receipt belong to the selected student, never to the roster. */
export function bindStudentOpeningMessage(editor: HTMLElement) {
  const doc = editor.ownerDocument;
  const win = doc.defaultView;
  const form = editor.querySelector<HTMLFormElement>('[data-student-message-form]');
  const empty = { isDirty: () => false, isPending: () => false, dispose: () => {} };
  if (!form) return empty;
  const query = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector);
  const title = query<HTMLInputElement>('[data-message-title]');
  const content = query<HTMLTextAreaElement>('[data-message-content]');
  const enabled = query<HTMLInputElement>('[data-message-enabled]');
  const status = query<HTMLElement>('[data-message-status]');
  const feedback = query<HTMLElement>('[data-message-feedback]');
  const save = query<HTMLButtonElement>('[data-message-save]');
  const preview = query<HTMLButtonElement>('[data-message-preview]');
  const dialog = editor.querySelector<HTMLDialogElement>('[data-message-dialog]');
  const close = dialog.querySelector<HTMLButtonElement>('[data-message-preview-close]');
  const lifetime = new win.AbortController();
  const uid = editor.dataset.studentUid;
  let saved: OpeningMessage = { title: '', content: '', revision: '', enabled: false };
  try {
    saved = { ...saved, ...JSON.parse(form.dataset.initial || '{}') };
  } catch { /* Leave an empty, editable draft if the initial data is unavailable. */ }
  title.value = saved.title || '';
  content.value = saved.content || '';
  enabled.checked = !!saved.enabled;
  let pending = false;
  let disposed = false;
  let request: AbortController | null = null;
  const canonical = (value: Pick<OpeningMessage, 'title' | 'content' | 'enabled'>) => JSON.stringify({
    title: value.title.trim(), content: value.content.replace(/\r\n?/g, '\n').trim(), enabled: !!value.enabled,
  });
  const draft = () => ({ title: title.value, content: content.value, enabled: enabled.checked });
  const isDirty = () => canonical(draft()) !== canonical(saved);
  function message(text: string, error = false) {
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle('is-error', error);
  }
  function renderStatus() {
    const text = !saved.revision ? '尚未设置' : !saved.enabled ? '未开启'
      : saved.acknowledgedAt ? '学员已确认' : '等待学员查看';
    status.replaceChildren();
    const label = doc.createElement('span');
    label.className = 'student-message-status__badge';
    label.textContent = text;
    status.append(label);
    status.classList.toggle('is-read', !!saved.enabled && !!saved.acknowledgedAt);
    status.classList.toggle('is-unread', !!saved.enabled && !saved.acknowledgedAt);
    if (saved.acknowledgedAt) {
      const when = new Date(saved.acknowledgedAt);
      if (!Number.isNaN(when.getTime())) {
        const date = doc.createElement('span');
        date.className = 'student-message-status__date';
        date.textContent = `${new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(when)} 已确认 · 北京时间`;
        status.append(date);
      }
    }
  }
  function updateFields() {
    title.required = enabled.checked;
    content.required = enabled.checked;
    preview.disabled = !title.value.trim() || !content.value.trim();
    form.classList.toggle('is-dirty', isDirty());
  }
  function closePreview(restoreFocus = true) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    dialog.classList.remove('is-fallback-open');
    doc.body.classList.remove('student-message-preview-open');
    if (restoreFocus && preview.isConnected) preview.focus();
  }
  preview.addEventListener('click', () => {
    if (preview.disabled) return;
    dialog.querySelector<HTMLElement>('[data-message-preview-title]').textContent = title.value.trim();
    dialog.querySelector<HTMLElement>('[data-message-preview-content]').textContent = content.value.trim();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      dialog.classList.add('is-fallback-open');
    }
    doc.body.classList.add('student-message-preview-open');
    close.focus();
  }, { signal: lifetime.signal });
  close.addEventListener('click', () => closePreview(), { signal: lifetime.signal });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePreview();
  }, { signal: lifetime.signal });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      close.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePreview();
    }
  }, { signal: lifetime.signal });
  form.addEventListener('input', updateFields, { signal: lifetime.signal });
  form.addEventListener('change', updateFields, { signal: lifetime.signal });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || disposed || !form.reportValidity()) return;
    const saving = draft();
    const initialDraft = canonical(saving);
    const url = new win.URL(win.location.href);
    url.searchParams.set('uid', uid);
    request = new win.AbortController();
    pending = true;
    save.disabled = true;
    save.textContent = '正在保存…';
    form.setAttribute('aria-busy', 'true');
    message('');
    try {
      const response = await win.fetch(url.href, {
        method: 'POST', credentials: 'same-origin', signal: request.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'save_opening_message', uid: Number(uid), ...saving,
          revision: saved.revision, enabled: saving.enabled ? '1' : '0' }),
      });
      let result;
      try { result = await response.json(); } catch {
        throw new Error('身份验证可能已过期。请完成身份验证后重试，当前修改已保留。');
      }
      if (!response.ok || !result.saved || !result.selectedOpeningMessage) {
        if (result.url || result.redirect || response.status === 401) {
          throw new Error('请完成身份验证后重试，当前修改已保留。');
        }
        const detail = result.error?.name === 'ValidationError' && typeof result.error.params?.[2] === 'string'
          ? result.error.params[2] : result.error?.message || result.message;
        throw new Error(typeof detail === 'string' ? detail : '保存未完成，请重试。');
      }
      if (disposed || !editor.isConnected || editor.dataset.studentUid !== uid) return;
      const fresh = result.selectedOpeningMessage;
      if (typeof fresh.title !== 'string' || typeof fresh.content !== 'string'
        || typeof fresh.revision !== 'string' || typeof fresh.enabled !== 'boolean') {
        throw new Error('保存结果无法确认。当前修改已保留，请刷新页面确认后再保存。');
      }
      saved = fresh;
      if (canonical(draft()) === initialDraft) {
        title.value = saved.title;
        content.value = saved.content;
        enabled.checked = saved.enabled;
      }
      renderStatus();
      updateFields();
      message(isDirty() ? '已保存。之后的修改还未保存。' : '开屏消息已保存。');
    } catch (error) {
      if (!disposed && editor.isConnected && !request.signal.aborted) {
        message(typeof (error as Error)?.message === 'string' ? (error as Error).message : '保存失败，请重试。', true);
      }
    } finally {
      pending = false;
      if (!disposed && editor.isConnected) {
        save.disabled = false;
        save.textContent = '保存开屏消息';
        form.removeAttribute('aria-busy');
      }
    }
  }, { signal: lifetime.signal });
  renderStatus();
  updateFields();
  return {
    isDirty,
    isPending: () => pending,
    dispose: () => {
      disposed = true;
      request?.abort();
      lifetime.abort();
      closePreview(false);
    },
  };
}
