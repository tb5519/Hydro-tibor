import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['scratch_main', 'scratch_works', 'scratch_assignment'], () => {
  const dialog = document.querySelector<HTMLDialogElement>('[data-scratch-manage-dialog]');
  const form = dialog?.querySelector<HTMLFormElement>('[data-scratch-manage-form]');
  const input = form?.querySelector<HTMLInputElement>('input[name=title]');
  const status = dialog?.querySelector<HTMLElement>('[data-scratch-manage-status]');
  const confirmPanel = dialog?.querySelector<HTMLElement>('[data-scratch-manage-confirm]');
  const confirmMessage = dialog?.querySelector<HTMLElement>('[data-scratch-manage-confirm-message]');
  const copyButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-manage-copy]');
  const deleteButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-manage-delete]');
  const cancelButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-manage-cancel]');
  const confirmButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-manage-delete-confirm]');
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-dialog-close]');
  const renameButton = dialog?.querySelector<HTMLButtonElement>('[data-scratch-manage-rename]');
  let trigger: HTMLButtonElement | null = null;
  let endpoint = '';
  let title = '';
  let busy = false;
  let request: AbortController | null = null;

  const setStatus = (message: string, error = false) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.error = String(error);
  };
  const setBusy = (value: boolean) => {
    busy = value;
    for (const button of [copyButton, deleteButton, cancelButton, confirmButton, closeButton, renameButton]) {
      if (button) button.disabled = value;
    }
    if (input) input.disabled = value;
  };
  const localUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('作品地址无效，请刷新后重试。');
    return url.href;
  };
  const submit = async (fields: Record<string, string>) => {
    request = new AbortController();
    const timer = setTimeout(() => request?.abort(), 30000);
    try {
      const response = await fetch(localUrl(endpoint), {
        method: 'POST', credentials: 'same-origin', signal: request.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams(fields),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const detail = Array.isArray(result.error?.params) ? result.error.params.join(' ') : '';
        throw new Error(detail || result.error?.message || result.message || '操作没有完成，请重试。');
      }
      return result;
    } finally {
      clearTimeout(timer);
      request = null;
    }
  };
  const updateCardTitle = (nextTitle: string) => {
    const card = trigger?.closest<HTMLElement>('[data-scratch-work-card]');
    if (!card || !trigger) return;
    trigger.textContent = nextTitle;
    trigger.dataset.title = nextTitle;
    trigger.title = `管理作品：${nextTitle}`;
    trigger.setAttribute('aria-label', `管理作品：${nextTitle}`);
    const image = card.querySelector<HTMLImageElement>('[data-scratch-thumbnail-image]');
    if (image) image.alt = `${nextTitle} 的舞台截图`;
    const play = card.querySelector<HTMLAnchorElement>('.sc-work-play');
    if (play) play.setAttribute('aria-label', `播放作品：${nextTitle}`);
    const edit = card.querySelector<HTMLAnchorElement>('.sc-work-edit');
    if (edit) edit.setAttribute('aria-label', `${edit.classList.contains('sc-work-edit-assist') ? '代学员编辑作品：' : '编辑作品：'}${nextTitle}`);
    const share = card.querySelector<HTMLButtonElement>('[data-scratch-share]');
    if (share) {
      share.dataset.title = nextTitle;
      share.setAttribute('aria-label', `分享作品：${nextTitle}`);
    }
    const updated = card.querySelector<HTMLElement>('.sc-work-updated');
    if (updated) updated.textContent = '刚刚';
  };
  const run = async (fields: Record<string, string>, pending: string, success: (result: any) => void) => {
    if (busy || !dialog?.open || !endpoint) return;
    setBusy(true);
    setStatus(pending);
    try {
      const result = await submit(fields);
      if (dialog.open) success(result);
    } catch (error) {
      if (dialog.open) {
        setStatus(['AbortError', 'TypeError'].includes(error.name) ? '网络不稳定，请重试。' : error.message, true);
      }
    } finally {
      if (dialog.open) setBusy(false);
    }
  };

  const filterForm = document.querySelector<HTMLFormElement>('[data-scratch-owner-filter]');
  filterForm?.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement) filterForm.submit();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-scratch-manage]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog || !input || busy) return;
      trigger = button;
      endpoint = button.dataset.scratchManage || '';
      title = button.dataset.title || button.textContent?.trim() || '';
      input.value = title;
      input.setCustomValidity('');
      if (confirmPanel) confirmPanel.hidden = true;
      setStatus('');
      dialog.showModal();
      input.focus();
      input.select();
    });
  });

  input?.addEventListener('input', () => input.setCustomValidity(''));
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input || busy) return;
    const nextTitle = input.value.trim();
    if (!nextTitle || nextTitle.length > 120) {
      input.setCustomValidity('请输入 1～120 字的作品名称。');
      input.reportValidity();
      return;
    }
    input.value = nextTitle;
    if (nextTitle === title) {
      setStatus('名称没有变化。');
      return;
    }
    if (confirmPanel) confirmPanel.hidden = true;
    run({ title: nextTitle }, '正在保存名称…', (result) => {
      title = typeof result.title === 'string' ? result.title : nextTitle;
      input.value = title;
      updateCardTitle(title);
      setStatus('名称已更新。');
    });
  });
  copyButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    run({ operation: 'copy' }, '正在创建独立副本…', (result) => {
      if (typeof result.workId !== 'string' || !/^[a-f\d]{24}$/i.test(result.workId)) {
        throw new Error('副本已创建，请刷新作品列表查看。');
      }
      const edit = trigger?.closest<HTMLElement>('[data-scratch-work-card]')?.querySelector<HTMLAnchorElement>('.sc-work-edit');
      if (!edit) {
        location.reload();
        return;
      }
      const url = new URL(localUrl(edit.href));
      url.searchParams.set('workId', result.workId);
      location.assign(url.href);
    });
  });
  deleteButton?.addEventListener('click', () => {
    if (busy || !confirmPanel) return;
    confirmPanel.hidden = false;
    if (confirmMessage) confirmMessage.textContent = `确定删除《${title}》吗？删除后无法恢复。`;
    setStatus('');
    cancelButton?.focus();
  });
  cancelButton?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
    deleteButton?.focus();
  });
  confirmButton?.addEventListener('click', () => {
    run({ operation: 'delete' }, '正在删除作品…', () => location.reload());
  });
  closeButton?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog?.addEventListener('close', () => {
    request?.abort();
    setBusy(false);
    trigger?.focus();
  });
  dialog?.addEventListener('click', (event) => {
    if (busy || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  window.addEventListener('pagehide', () => request?.abort());
});
