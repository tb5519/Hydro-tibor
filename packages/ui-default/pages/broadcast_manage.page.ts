import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

interface Broadcast {
  title: string;
  content: string;
  revision: string;
  enabled: boolean;
  updatedAt?: string;
}

export function bindBroadcastEditor() {
  const root = document.querySelector<HTMLElement>('[data-broadcast-admin]');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const form = find<HTMLFormElement>('[data-broadcast-form]');
  const title = find<HTMLInputElement>('[name="title"]');
  const revision = find<HTMLInputElement>('[name="revision"]');
  const editor = find('[data-broadcast-editor]');
  const publish = find<HTMLButtonElement>('[data-broadcast-publish]');
  const preview = find<HTMLButtonElement>('[data-broadcast-preview]');
  const previewDialog = find<HTMLDialogElement>('[data-broadcast-preview-dialog]');
  const message = find('[data-broadcast-message]');
  const linkPanel = find('[id="broadcast-link-panel"]');
  const linkInput = find<HTMLInputElement>('#broadcast-link-url');
  let enabled = root.dataset.enabled === 'true';
  let baseline = { title: title.value, content: editor.innerHTML };
  let busy = false;
  let selection: Range | null = null;
  let previewFocus: HTMLElement | null = null;
  const dirty = () => title.value !== baseline.title || editor.innerHTML !== baseline.content;
  const textContent = () => (editor.textContent || '').replace(/\u200B/g, '').trim();

  function showMessage(text: string, type = 'success') {
    message.textContent = text;
    message.className = `broadcast-admin__message is-${type}`;
    message.hidden = false;
    message.setAttribute('role', type === 'error' ? 'alert' : 'status');
    if (type === 'error') message.focus();
  }

  function update() {
    find('[data-broadcast-title-count]').textContent = `${title.value.length} / 100`;
    find('[data-broadcast-content-count]').textContent = `${Array.from(textContent()).length.toLocaleString()} 字`;
    const state = find('[data-broadcast-draft-state]');
    state.textContent = dirty() ? '有未发布的修改' : revision.value ? '内容已保存' : '编辑后记得发布';
    state.classList.toggle('is-dirty', dirty());
    publish.textContent = busy ? '正在处理…' : enabled ? '更新并发布' : revision.value ? '重新发布广播' : '发布广播';
    publish.disabled = busy || (enabled && !dirty());
    preview.disabled = busy;
  }

  function setBusy(value: boolean) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    title.disabled = value;
    editor.contentEditable = value ? 'false' : 'true';
    root.querySelectorAll<HTMLButtonElement>('button:not([data-broadcast-preview-close])').forEach((button) => { button.disabled = value; });
    update();
  }

  function setUpdatedAt(value?: string) {
    const date = value && new Date(value);
    find('[data-broadcast-updated]').textContent = date && Number.isFinite(date.getTime())
      ? `最近更新 ${date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
  }

  function validate() {
    if (!title.value.trim()) {
      showMessage('请为广播写一个简洁的标题。', 'error');
      title.focus();
      return false;
    }
    if (!textContent() && !editor.querySelector('img')) {
      editor.setAttribute('aria-invalid', 'true');
      showMessage('广播正文还是空的，写下想告诉同学们的消息吧。', 'error');
      editor.focus();
      return false;
    }
    if (editor.innerHTML.length > 100000) {
      showMessage('广播内容过长，请适当精简后再发布。', 'error');
      return false;
    }
    return true;
  }

  function saveSelection() {
    const current = window.getSelection();
    if (current?.rangeCount && editor.contains(current.getRangeAt(0).commonAncestorContainer)) selection = current.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    editor.focus();
    const current = window.getSelection();
    if (selection && editor.contains(selection.commonAncestorContainer)) {
      current.removeAllRanges();
      current.addRange(selection);
    }
  }

  function command(name: string, value?: string) {
    restoreSelection();
    document.execCommand(name, false, value);
    saveSelection();
    update();
  }

  function closeLink() {
    linkPanel.hidden = true;
    find('[data-editor-link]').setAttribute('aria-expanded', 'false');
    linkInput.value = '';
    linkInput.setCustomValidity('');
  }

  editor.addEventListener('input', () => {
    editor.removeAttribute('aria-invalid');
    if (!textContent() && !editor.querySelector('img') && editor.innerHTML !== '') editor.innerHTML = '';
    saveSelection();
    update();
  });
  editor.addEventListener('keyup', saveSelection);
  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('focus', saveSelection);
  title.addEventListener('input', update);
  // Plain text paste keeps Office markup and embedded third-party content out of the editor.
  editor.addEventListener('paste', (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (text) {
      saveSelection();
      command('insertText', text);
    }
  });
  editor.addEventListener('drop', (event) => event.preventDefault());
  root.querySelectorAll<HTMLButtonElement>('[data-editor-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (busy) return;
      command(button.dataset.editorCommand, button.dataset.editorValue);
      if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.editorCommand)));
    });
  });
  find('[data-editor-link]').addEventListener('mousedown', (event) => event.preventDefault());
  find('[data-editor-link]').addEventListener('click', () => {
    saveSelection();
    linkPanel.hidden = !linkPanel.hidden;
    find('[data-editor-link]').setAttribute('aria-expanded', String(!linkPanel.hidden));
    if (!linkPanel.hidden) {
      linkInput.value = '';
      linkInput.focus();
    }
  });
  find('[data-editor-link-cancel]').addEventListener('click', () => {
    closeLink();
    restoreSelection();
  });
  const applyLink = () => {
    const url = linkInput.value.trim();
    if (!/^https?:\/\//i.test(url) || !linkInput.checkValidity()) {
      linkInput.setCustomValidity('请输入以 https:// 或 http:// 开头的完整网址。');
      linkInput.reportValidity();
      return;
    }
    restoreSelection();
    if (window.getSelection()?.isCollapsed) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.textContent = url;
      command('insertHTML', anchor.outerHTML);
    } else command('createLink', url);
    closeLink();
  };
  find('[data-editor-link-apply]').addEventListener('click', applyLink);
  linkInput.addEventListener('input', () => linkInput.setCustomValidity(''));
  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLink();
      restoreSelection();
    }
  });

  async function mutate(operation: 'publish' | 'disable') {
    if (busy || (operation === 'publish' && !validate())) return;
    const draftBefore = { title: title.value, content: editor.innerHTML };
    const hadChanges = dirty();
    setBusy(true);
    closeLink();
    try {
      const response = await request.post(form.action, {
        operation, revision: revision.value,
        ...(operation === 'publish' ? { title: title.value, content: editor.innerHTML } : {}),
      }, { timeout: 30000 });
      const saved: Broadcast = response.broadcast;
      if (!saved || typeof saved.revision !== 'string' || typeof saved.content !== 'string' || typeof saved.title !== 'string') {
        throw new Error('暂时无法确认保存结果，请保留当前内容，刷新页面后查看。');
      }
      revision.value = saved.revision;
      enabled = saved.enabled;
      root.dataset.enabled = String(enabled);
      baseline = { title: saved.title, content: saved.content };
      if (operation === 'disable' && hadChanges) {
        title.value = draftBefore.title;
        editor.innerHTML = draftBefore.content;
      } else {
        title.value = saved.title;
        editor.innerHTML = saved.content;
        // Browser normalization of valid HTML must not make a saved editor look dirty.
        baseline.content = editor.innerHTML;
      }
      const status = find('[data-broadcast-status]');
      status.textContent = enabled ? '正在展示' : '已停止展示';
      status.classList.toggle('is-live', enabled);
      find('[data-broadcast-pause]').hidden = !enabled;
      find('[data-broadcast-disable-confirm]').hidden = true;
      setUpdatedAt(saved.updatedAt);
      showMessage(operation === 'publish' ? '广播已发布，同学下次访问时会收到提醒。'
        : hadChanges ? '广播已停止展示。你的未发布修改已保留在编辑器中。' : '广播已停止展示，正文和已读记录已保留。');
    } catch (error) {
      showMessage(`${error.message || '操作失败，请稍后重试。'} 当前编辑内容已保留。`, 'error');
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    mutate('publish');
  });
  find('[data-broadcast-disable]').addEventListener('click', () => {
    find('[data-broadcast-disable-confirm]').hidden = false;
    find('[data-broadcast-disable-apply]').focus();
  });
  find('[data-broadcast-disable-cancel]').addEventListener('click', () => {
    find('[data-broadcast-disable-confirm]').hidden = true;
    find('[data-broadcast-disable]').focus();
  });
  find('[data-broadcast-disable-apply]').addEventListener('click', () => mutate('disable'));

  preview.addEventListener('click', async () => {
    if (busy || !validate()) return;
    setBusy(true);
    preview.textContent = '正在准备预览…';
    try {
      const result = await request.post(form.action, { operation: 'preview', title: title.value, content: editor.innerHTML }, { timeout: 30000 });
      if (typeof result.title !== 'string' || typeof result.content !== 'string') throw new Error('预览暂时不可用，请稍后重试。');
      find('[data-broadcast-preview-title]').textContent = result.title;
      // Only the server-sanitized result is rendered in the student preview.
      find('[data-broadcast-preview-content]').innerHTML = result.content;
      previewFocus = preview;
      if (previewDialog.showModal) previewDialog.showModal();
      else previewDialog.setAttribute('open', '');
    } catch (error) {
      showMessage(error.message || '预览失败，请稍后重试。', 'error');
    } finally {
      preview.textContent = '预览学员视角';
      setBusy(false);
    }
  });
  const closePreview = () => {
    if (previewDialog.close) previewDialog.close();
    else previewDialog.removeAttribute('open');
    previewFocus?.focus();
  };
  root.querySelectorAll('[data-broadcast-preview-close]').forEach((button) => button.addEventListener('click', closePreview));
  previewDialog.addEventListener('close', () => previewFocus?.focus());
  previewDialog.addEventListener('click', (event) => { if (event.target === previewDialog) closePreview(); });

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (root.isConnected && (busy || dirty())) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  setUpdatedAt(find('[data-broadcast-updated]').dataset.updatedAt);
  update();
}

export default new NamedPage(['manage_broadcast', 'domain_broadcast'], bindBroadcastEditor);
