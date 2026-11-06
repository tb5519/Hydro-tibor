interface JoinDomain {
  _id: string;
  name: string;
  avatarUrl: string;
  domainType?: string;
  requiresCode: boolean;
  joinUrl: string;
}
interface JoinApi {
  get: (url: string) => Promise<JoinDomain[]>;
  post: (url: string, data: { code: string }) => Promise<{ success: boolean; url: string }>;
  navigate: (url: string) => void;
}

interface SettingsApi {
  post: (url: string, data: { enabled: string; invitationCode: string }) => Promise<{
    saved: boolean; enabled: boolean; invitationCode?: string;
  }>;
}

export function bindDomainJoinSettings(root: Document, api: SettingsApi) {
  const form = root.querySelector<HTMLFormElement>('[data-domain-join-settings]');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  const enabled = form.querySelector<HTMLInputElement>('[name="enabled"]');
  const code = form.querySelector<HTMLInputElement>('[name="invitationCode"]');
  const codeSection = form.querySelector<HTMLElement>('#domain-join-code-settings');
  const save = form.querySelector<HTMLButtonElement>('[data-join-settings-save]');
  const status = form.querySelector<HTMLElement>('[data-join-settings-status]');
  const note = form.querySelector<HTMLElement>('[data-join-mode-note]');
  const badge = form.querySelector<HTMLElement>('[data-join-settings-badge]');
  let original = JSON.stringify([enabled.checked, code.value]);
  let originalStatus = status.textContent;
  let busy = false;
  const update = () => {
    codeSection.hidden = !enabled.checked;
    const dirty = original !== JSON.stringify([enabled.checked, code.value]);
    save.disabled = busy || !dirty;
    status.classList.remove('is-error');
    status.textContent = dirty ? '有未保存的更改' : originalStatus;
    status.classList.toggle('is-unsaved', dirty);
    note.textContent = enabled.checked
      ? '学员可主动加入；老师也可以在学员管理中直接添加。'
      : '学员看不到这个域的加入入口，由老师在“控制面板 → 学员管理”中添加。';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || save.disabled) return;
    busy = true;
    enabled.disabled = true;
    code.disabled = true;
    save.disabled = true;
    save.textContent = '正在保存…';
    status.classList.remove('is-error', 'is-unsaved');
    status.textContent = '正在保存设置';
    try {
      const result = await api.post(form.action, {
        enabled: enabled.checked ? 'on' : 'off', invitationCode: code.value,
      });
      if (!result?.saved) throw new Error('设置尚未保存，请重试。');
      enabled.checked = result.enabled;
      code.value = result.invitationCode ?? code.value.trim();
      original = JSON.stringify([enabled.checked, code.value]);
      originalStatus = '设置已保存。';
      badge.textContent = enabled.checked ? '已开放' : '仅老师添加';
      badge.classList.toggle('is-open', enabled.checked);
      busy = false;
      update();
    } catch (reason) {
      busy = false;
      update();
      status.textContent = reason instanceof Error ? reason.message : '保存失败，请稍后重试。';
      status.classList.add('is-error');
    } finally {
      enabled.disabled = false;
      code.disabled = false;
      save.textContent = '保存设置';
    }
  });
  root.defaultView?.addEventListener('pageshow', () => { save.textContent = '保存设置'; update(); });
  update();
}

export function bindDomainJoinPicker(root: Document, api: JoinApi) {
  const container = root.querySelector<HTMLElement>('[data-home-domains]');
  if (!container || container.dataset.bound) return;
  container.dataset.bound = 'true';
  const dialog = container.querySelector<HTMLDialogElement>('[data-join-picker]');
  const openButton = container.querySelector<HTMLButtonElement>('#join-domain-button');
  if (!dialog || !openButton) return;
  const find = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector);
  const browse = find<HTMLElement>('[data-join-browse]');
  const list = find<HTMLElement>('[data-join-list]');
  const search = find<HTMLInputElement>('[data-join-search]');
  const loading = find<HTMLElement>('[data-join-loading]');
  const empty = find<HTMLElement>('[data-join-empty]');
  const error = find<HTMLElement>('[data-join-error]');
  const retry = find<HTMLButtonElement>('[data-join-retry]');
  const form = find<HTMLFormElement>('[data-join-code-form]');
  const code = find<HTMLInputElement>('[data-join-code]');
  const confirm = find<HTMLButtonElement>('[data-join-confirm]');
  let domains: JoinDomain[] = [];
  let selected: JoinDomain | null = null;
  let busy = false;
  let generation = 0;
  function clearError() { error.hidden = true; error.textContent = ''; }
  function showError(reason: unknown) {
    error.textContent = reason instanceof Error ? reason.message : '暂时无法完成，请稍后重试。';
    error.hidden = false;
  }
  function setBusy(value: boolean) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = value; });
    code.disabled = value;
    search.disabled = value;
    confirm.textContent = value ? '正在加入…' : '确认加入';
  }
  function sameOriginUrl(value: string) {
    const url = new URL(value, root.location.href);
    if (url.origin !== root.location.origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('课堂链接无效，请刷新后重试。');
    return url.href;
  }
  async function join(item: JoinDomain, invitationCode = '') {
    if (busy) return;
    clearError();
    setBusy(true);
    try {
      const result = await api.post(sameOriginUrl(item.joinUrl), { code: invitationCode.trim() });
      if (!result?.success || !result.url) throw new Error('加入尚未完成，请稍后重试。');
      api.navigate(sameOriginUrl(result.url));
    } catch (reason) {
      showError(reason);
      if (selected) code.setAttribute('aria-invalid', 'true');
      else {
        retry.textContent = '刷新课堂列表';
        retry.hidden = false;
      }
      setBusy(false);
      if (selected) code.focus();
    }
  }
  function select(item: JoinDomain) {
    if (busy) return;
    clearError();
    if (!item.requiresCode) { void join(item); return; }
    selected = item;
    browse.hidden = true;
    form.hidden = false;
    retry.hidden = true;
    find<HTMLElement>('[data-join-name]').textContent = item.name;
    find<HTMLImageElement>('[data-join-avatar]').src = item.avatarUrl;
    code.value = '';
    code.removeAttribute('aria-invalid');
    code.focus();
  }
  function render() {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = domains.filter((item) => `${item.name} ${item._id}`.toLocaleLowerCase().includes(query));
    empty.hidden = filtered.length > 0;
    find<HTMLElement>('[data-join-empty-title]').textContent = query ? '没有找到这个课堂' : '暂时没有可加入的课堂';
    find<HTMLElement>('[data-join-empty-note]').textContent = query ? '换个名称试试，或向老师确认是否已开放加入。' : '你已加入所有开放的课堂，或老师暂未开放主动加入。';
    for (const item of filtered) {
      const card = root.createElement('div');
      card.className = 'domain-join-picker__item';
      const avatar = root.createElement('img');
      avatar.src = item.avatarUrl;
      avatar.alt = '';
      avatar.width = 44;
      avatar.height = 44;
      const text = root.createElement('div');
      text.className = 'domain-join-picker__item-info';
      const name = root.createElement('h3');
      name.textContent = item.name;
      const detail = root.createElement('p');
      detail.textContent = `${item.domainType === 'scratch' ? 'Scratch 创作' : '编程训练'} · ${item.requiresCode ? '需要加入指令' : '可直接加入'}`;
      text.append(name, detail);
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'domain-join-picker__join';
      button.textContent = item.requiresCode ? '输入指令' : '加入';
      button.setAttribute('aria-label', `${item.requiresCode ? '输入指令加入' : '加入'} ${item.name}`);
      button.addEventListener('click', () => select(item));
      card.append(avatar, text, button);
      list.append(card);
    }
  }
  async function load() {
    const requestId = ++generation;
    clearError();
    retry.textContent = '重新加载';
    domains = [];
    list.replaceChildren();
    empty.hidden = true;
    retry.hidden = true;
    loading.hidden = false;
    search.disabled = true;
    try {
      const url = new URL(container.dataset.domainSearchUrl, root.location.href);
      url.searchParams.set('purpose', 'join');
      const result = await api.get(sameOriginUrl(url.href));
      if (requestId !== generation || !dialog.open) return;
      if (!Array.isArray(result)) throw new Error('课堂列表加载失败，请重试。');
      domains = result;
      render();
    } catch (reason) {
      if (requestId !== generation || !dialog.open) return;
      showError(reason);
      retry.hidden = false;
    } finally {
      if (requestId === generation) { loading.hidden = true; search.disabled = false; }
    }
  }
  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    selected = null;
    search.value = '';
    browse.hidden = false;
    form.hidden = true;
    setBusy(false);
    dialog.showModal();
    void load();
  });
  const close = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { generation++; openButton.focus(); });
  find<HTMLButtonElement>('[data-join-close]').addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  find<HTMLButtonElement>('[data-join-back]').addEventListener('click', () => {
    if (busy) return;
    selected = null;
    form.hidden = true;
    browse.hidden = false;
    clearError();
    search.focus();
  });
  search.addEventListener('input', render);
  retry.addEventListener('click', () => { void load(); });
  code.addEventListener('input', () => { code.removeAttribute('aria-invalid'); clearError(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    if (!code.value.trim()) { showError(new Error('请输入老师提供的加入指令。')); code.focus(); return; }
    void join(selected, code.value);
  });
}
