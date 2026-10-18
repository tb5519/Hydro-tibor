import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['scratch_assignments', 'scratch_assignment'], () => {
  const dialog = document.querySelector<HTMLDialogElement>('[data-assignment-delete-dialog]');
  if (!dialog) return;
  const name = dialog.querySelector<HTMLElement>('[data-assignment-delete-name]');
  const status = dialog.querySelector<HTMLElement>('[data-assignment-delete-status]');
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-assignment-delete-confirm]');
  const cancel = [...dialog.querySelectorAll<HTMLButtonElement>('[data-assignment-delete-cancel]')];
  const pageStatus = document.querySelector<HTMLElement>('[data-assignment-action-status]');
  const actions = [...document.querySelectorAll<HTMLButtonElement>('[data-assignment-action]')];
  let trigger: HTMLButtonElement | null = null;
  let pending = false;
  let request: AbortController | null = null;
  const localUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (!value || url.origin !== location.origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('作业地址无效，请刷新后重试。');
    return url.href;
  };
  const setStatus = (element: HTMLElement, message: string, error = false) => {
    if (!element) return;
    element.textContent = message;
    element.dataset.error = String(error);
  };
  const change = async (button: HTMLButtonElement, operation: 'delete' | 'restore') => {
    if (pending) return;
    pending = true;
    actions.forEach((item) => { item.disabled = true; });
    cancel.forEach((item) => { item.disabled = true; });
    if (confirm) confirm.disabled = true;
    const output = operation === 'delete' ? status : pageStatus;
    setStatus(output, operation === 'delete' ? '正在删除作业…' : '正在恢复作业…');
    request = new AbortController();
    const timer = setTimeout(() => request?.abort(), 20000);
    try {
      const response = await fetch(localUrl(button.dataset.assignmentUrl), {
        method: 'POST', credentials: 'same-origin', signal: request.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ operation }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.params?.join(' ') || data.error?.message || '暂时无法完成，请重试。');
      const url = localUrl(data.url);
      setStatus(output, operation === 'delete' ? '作业已删除，正在打开已删除列表…' : '作业已恢复，正在打开作业…');
      location.assign(url);
    } catch (error) {
      setStatus(output, error.name === 'AbortError' ? '等待超时，请重试。' : error.message || '暂时无法完成，请重试。', true);
      pending = false;
      actions.forEach((item) => { item.disabled = false; });
      cancel.forEach((item) => { item.disabled = false; });
      if (confirm) confirm.disabled = false;
    } finally {
      clearTimeout(timer);
      request = null;
    }
  };
  for (const button of actions) {
    button.addEventListener('click', () => {
      if (pending) return;
      if (button.dataset.assignmentAction === 'restore') {
        void change(button, 'restore');
        return;
      }
      trigger = button;
      if (name) name.textContent = button.dataset.assignmentTitle || '这份作业';
      setStatus(status, '');
      dialog.showModal();
      cancel[cancel.length - 1]?.focus();
    });
  }
  confirm?.addEventListener('click', () => {
    if (trigger && dialog.open) void change(trigger, 'delete');
  });
  cancel.forEach((button) => button.addEventListener('click', () => { if (!pending) dialog.close(); }));
  dialog.addEventListener('cancel', (event) => { if (pending) event.preventDefault(); });
  dialog.addEventListener('close', () => trigger?.focus());
  window.addEventListener('pagehide', () => request?.abort());
});
