import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('scratch_community_detail', () => {
  const trigger = document.querySelector<HTMLButtonElement>('[data-scratch-community-unpublish]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-scratch-community-unpublish-dialog]');
  const confirm = document.querySelector<HTMLButtonElement>('[data-scratch-community-unpublish-confirm]');
  const status = document.querySelector<HTMLElement>('[data-scratch-community-unpublish-status]');
  const cancelButtons = Array.from(dialog?.querySelectorAll<HTMLButtonElement>(
    '[data-scratch-community-unpublish-cancel], [data-scratch-dialog-close]',
  ) || []);
  const cancel = cancelButtons.find((button) => button.closest('.sc-dialog-actions')) || cancelButtons[0];
  let busy = false;
  let request: AbortController | null = null;
  trigger?.addEventListener('click', () => {
    if (!dialog) return;
    if (status) status.textContent = '';
    dialog.showModal();
    cancel?.focus();
  });
  cancelButtons.forEach((button) => {
    button.addEventListener('click', () => { if (!busy) dialog?.close(); });
  });
  dialog?.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog?.addEventListener('close', () => trigger?.focus());
  confirm?.addEventListener('click', async () => {
    if (busy || !trigger || !dialog?.open) return;
    busy = true;
    confirm.disabled = true;
    cancelButtons.forEach((button) => { button.disabled = true; });
    if (status) { status.textContent = '正在从社区撤下…'; status.dataset.error = 'false'; }
    const current = new AbortController();
    request = current;
    const timer = setTimeout(() => current.abort(), 30000);
    try {
      const endpoint = new URL(trigger.dataset.scratchCommunityUnpublish || '', location.href);
      if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('作品地址无效，请刷新后重试。');
      const response = await fetch(endpoint.href, {
        method: 'POST', credentials: 'same-origin', signal: current.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ operation: 'unpublish' }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('暂时无法撤下作品，请重试。');
      const next = new URL(result.url || trigger.dataset.communityReturn || './', location.href);
      if (next.origin !== location.origin || !['http:', 'https:'].includes(next.protocol)) throw new Error('作品已撤下，请返回社区。');
      location.assign(next.href);
    } catch (error) {
      if (status) {
        status.textContent = ['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，请重试。' : error.message;
        status.dataset.error = 'true';
      }
    } finally {
      clearTimeout(timer);
      if (request === current) request = null;
      busy = false;
      confirm.disabled = false;
      cancelButtons.forEach((button) => { button.disabled = false; });
    }
  });
  window.addEventListener('pagehide', () => request?.abort());
});
