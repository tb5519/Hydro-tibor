import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['scratch_main', 'scratch_works', 'scratch_assignment'], () => {
  const createDialog = document.querySelector<HTMLDialogElement>('[data-scratch-create-dialog]');
  const shareDialog = document.querySelector<HTMLDialogElement>('[data-scratch-share-dialog]');
  const createForm = document.querySelector<HTMLFormElement>('[data-scratch-create-form]');
  const shareText = document.querySelector<HTMLTextAreaElement>('[data-scratch-share-text]');
  const shareStatus = document.querySelector<HTMLElement>('[data-scratch-share-status]');
  const copyButton = document.querySelector<HTMLButtonElement>('[data-scratch-copy-share]');
  const revokeButton = document.querySelector<HTMLButtonElement>('[data-scratch-revoke-share]');
  let trigger: HTMLElement | null = null;
  let shareEndpoint = '';
  let request: AbortController | null = null;
  let sequence = 0;
  let stopped = false;
  let creating = false;

  const localUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('分享地址无效，请刷新后重试。');
    return url.href;
  };
  const status = (message: string, error = false) => {
    if (!shareStatus) return;
    shareStatus.textContent = message;
    shareStatus.dataset.error = String(error);
  };
  const requestShare = async (endpoint: string, revoke = false) => {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timer = setTimeout(() => current.abort(), 30000);
    try {
      const response = await fetch(localUrl(endpoint), {
        method: 'POST', credentials: 'same-origin', signal: current.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams(revoke ? { operation: 'revoke' } : {}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.params?.join(' ') || result.error?.message || result.message || '暂时无法分享，请重试。');
      }
      return result;
    } finally {
      clearTimeout(timer);
      if (request === current) request = null;
    }
  };

  for (const dialog of [createDialog, shareDialog]) {
    if (!dialog) continue;
    dialog.querySelectorAll<HTMLElement>('[data-scratch-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => dialog.close());
    });
    dialog.addEventListener('close', () => {
      if (dialog === shareDialog) { sequence += 1; request?.abort(); }
      trigger?.focus();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  const titleInput = createForm?.querySelector<HTMLInputElement>('input[name=title]');
  document.querySelectorAll<HTMLElement>('[data-scratch-create]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!createDialog || !createForm) return;
      trigger = button;
      creating = false;
      createForm.reset();
      titleInput?.setCustomValidity('');
      createForm.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = false; });
      createDialog.showModal();
      titleInput?.focus();
    });
  });
  titleInput?.addEventListener('input', () => titleInput.setCustomValidity(''));
  createForm?.addEventListener('submit', (event) => {
    if (!titleInput) return;
    if (creating) { event.preventDefault(); return; }
    titleInput.value = titleInput.value.trim();
    if (!titleInput.value || titleInput.value.length > 120) {
      event.preventDefault();
      titleInput.setCustomValidity('给作品起一个 1～120 字的名字吧。');
      titleInput.reportValidity();
      return;
    }
    creating = true;
    createForm.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = true; });
  });
  window.addEventListener('pageshow', () => {
    stopped = false;
    creating = false;
    createForm?.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = false; });
  });

  document.querySelectorAll<HTMLElement>('[data-scratch-share]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!shareDialog || !shareText || !copyButton) return;
      trigger = button;
      const id = ++sequence;
      shareEndpoint = button.dataset.scratchShare || '';
      shareText.value = '';
      copyButton.disabled = true;
      if (revokeButton) revokeButton.hidden = true;
      status('正在准备分享链接…');
      shareDialog.showModal();
      try {
        const result = await requestShare(shareEndpoint);
        if (stopped || id !== sequence || !shareDialog.open) return;
        if (typeof result.url !== 'string' || typeof result.title !== 'string') throw new Error('分享响应无效，请重试。');
        const url = localUrl(result.url);
        shareText.value = `我在 OneByOne 创作了《${result.title}》，快来看看吧！\n点击链接就能玩，无需登录：\n${url}`;
        copyButton.disabled = false;
        if (revokeButton) { revokeButton.hidden = false; revokeButton.disabled = false; }
        status('链接准备好啦，复制后发给家人或朋友吧。');
      } catch (error) {
        if (stopped || id !== sequence || !shareDialog.open) return;
        status(['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，请关闭窗口后重试。' : error.message, true);
      }
    });
  });
  copyButton?.addEventListener('click', async () => {
    if (!shareText?.value) return;
    const id = sequence;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareText.value);
      if (id === sequence && shareDialog?.open) status('已复制，去分享你的创意吧！');
    } catch {
      if (id !== sequence || !shareDialog?.open) return;
      shareText.focus();
      shareText.select();
      // HTTP deployments may not have Clipboard API access. Keep all text selected for manual copying.
      status('分享文字已选中，请按 Ctrl+C（Mac 按 ⌘C）复制。');
    }
  });
  revokeButton?.addEventListener('click', async () => {
    const id = ++sequence;
    revokeButton.disabled = true;
    if (copyButton) copyButton.disabled = true;
    status('正在关闭分享…');
    try {
      await requestShare(shareEndpoint, true);
      if (stopped || id !== sequence || !shareDialog?.open) return;
      if (shareText) shareText.value = '';
      revokeButton.hidden = true;
      status('分享已关闭，以前发出的链接已失效。');
    } catch (error) {
      if (stopped || id !== sequence || !shareDialog?.open) return;
      revokeButton.disabled = false;
      if (copyButton) copyButton.disabled = !shareText?.value;
      status('暂时无法关闭分享，请重试。', true);
    }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    sequence += 1;
    request?.abort();
    if (shareDialog?.open) shareDialog.close();
  });
});
