import { bindStudentDailyQuiz } from './student_daily_quiz';

export function bindStudentManagement(doc: Document) {
  const root = doc.querySelector<HTMLElement>('[data-student-management]');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  const win = doc.defaultView;
  const query = <T extends HTMLElement>(selector: string, scope: ParentNode = root) => scope.querySelector<T>(selector);
  const all = <T extends HTMLElement>(selector: string, scope: ParentNode = root) => [...scope.querySelectorAll<T>(selector)];
  const baselines = new WeakMap<HTMLFormElement, string>();
  const pending = new Set<HTMLFormElement>();
  let daily = { isDirty: () => false, isPending: () => false };
  let switching = false;
  let confirmedNavigation = false;
  let currentUrl = win.location.href;
  let modalOpener: HTMLElement;
  const search = query<HTMLInputElement>('[data-student-search]');
  const domainFilter = query<HTMLSelectElement>('[data-student-domain-filter]');
  const quizFilter = query<HTMLSelectElement>('[data-student-quiz-filter]');
  const host = query<HTMLElement>('[data-student-detail-host]');
  const addDialog = query<HTMLElement>('[data-student-add-dialog]');
  const addForm = query<HTMLFormElement>('[data-student-add-form]');
  function snapshot(form: HTMLFormElement) {
    return JSON.stringify([...new win.FormData(form).entries()]);
  }
  function remember(form: HTMLFormElement) {
    if (form) baselines.set(form, snapshot(form));
  }
  function isDirty() {
    return (
      daily.isDirty()
      || all<HTMLFormElement>('[data-student-profile-form], [data-student-password-form], [data-student-add-form]').some(
        (form) => baselines.has(form) && baselines.get(form) !== snapshot(form),
      )
    );
  }
  function feedback(selector: string, text: string, error = false) {
    const node = query<HTMLElement>(selector);
    if (!node) return;
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle('is-error', error);
  }
  function guard() {
    if (pending.size || daily.isPending() || switching) {
      feedback('[data-student-list-feedback]', '正在保存或切换学员，请稍候。', true);
      return false;
    }
    return !isDirty() || win.confirm('还有未保存的修改。继续后这些修改将被放弃，确定继续吗？');
  }
  function navigateConfirmed(url: URL) {
    confirmedNavigation = true;
    win.location.assign(url.href);
  }
  function withViewState(value: string) {
    const url = new win.URL(value, win.location.href);
    const current = new win.URL(win.location.href);
    ['q', 'domain', 'quiz', 'tab', 'quizView', 'quizDay'].forEach((key) => {
      if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
      else url.searchParams.delete(key);
    });
    return url;
  }
  function setUrl(url: URL, push = false) {
    win.history[push ? 'pushState' : 'replaceState'](null, '', url);
    currentUrl = url.href;
  }
  function updateQuery(key: string, value: string) {
    const url = new win.URL(win.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    setUrl(url);
  }
  function parseList(value: string) {
    try {
      return JSON.parse(value || '[]') as string[];
    } catch {
      return [];
    }
  }
  function filterRoster(restore = false) {
    if (restore) {
      const params = new win.URL(win.location.href).searchParams;
      search.value = params.get('q') || '';
      domainFilter.value = params.get('domain') || '';
      quizFilter.value = params.get('quiz') || '';
    }
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    const domainName = domainFilter.selectedOptions[0]?.dataset.domainName;
    all<HTMLElement>('[data-student-note]').forEach((note) => {
      const text = `${note.dataset.studentSearchText} ${note.textContent}`.toLowerCase();
      const matchesDomain =
        !domainFilter.value
        || parseList(note.dataset.studentDomains).includes(domainFilter.value)
        || parseList(note.dataset.studentDomainNames).includes(domainName);
      const matchesQuiz = !quizFilter.value || (quizFilter.value === 'enabled') === (note.dataset.studentQuizEnabled === 'true');
      const visible = words.every((word) => text.includes(word)) && matchesDomain && matchesQuiz;
      note.closest<HTMLElement>('[data-student-note-row]').hidden = !visible;
      if (visible) count++;
    });
    query<HTMLElement>('[data-student-visible-count]').textContent = `${count} 位`;
    query<HTMLElement>('[data-student-empty]').hidden = count > 0;
    if (!restore) {
      const url = new win.URL(win.location.href);
      [
        ['q', search.value],
        ['domain', domainFilter.value],
        ['quiz', quizFilter.value],
      ].forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      });
      setUrl(url);
    }
  }
  function activateTab(value: string, focus = false, persist = true) {
    const tab = ['profile', 'learning', 'daily'].includes(value) ? value : 'profile';
    all<HTMLElement>('[data-student-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.studentPanel !== tab;
    });
    const form = query<HTMLFormElement>('[data-student-profile-form]');
    if (form) form.hidden = tab === 'daily';
    all<HTMLElement>('[data-student-extra]').forEach((extra) => {
      extra.hidden = extra.dataset.studentExtra !== tab;
    });
    all<HTMLButtonElement>('[data-student-tab]').forEach((button) => {
      const selected = button.dataset.studentTab === tab;
      button.setAttribute('aria-selected', `${selected}`);
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    if (persist) updateQuery('tab', tab);
  }
  function initializeEditor() {
    const editor = query<HTMLElement>('[data-student-editor]');
    if (!editor) {
      daily = { isDirty: () => false, isPending: () => false };
      return;
    }
    all<HTMLFormElement>('[data-student-profile-form], [data-student-password-form]', editor).forEach(remember);
    daily = bindStudentDailyQuiz(editor, (enabled) => {
      const note = all<HTMLElement>('[data-student-note]').find((item) => item.dataset.studentUid === editor.dataset.studentUid);
      if (note) {
        note.dataset.studentQuizEnabled = `${enabled}`;
        const badge = query<HTMLElement>('[data-student-quiz-badge]', note);
        badge.textContent = enabled ? '每日问答已开启' : '每日问答未开启';
        badge.classList.toggle('is-enabled', enabled);
      }
      filterRoster(true);
    }, () => { currentUrl = win.location.href; });
    activateTab(new win.URL(win.location.href).searchParams.get('tab') || 'profile', false, false);
  }
  async function switchStudent(url: URL, push = true, alreadyConfirmed = false) {
    if (!alreadyConfirmed && !guard()) return false;
    const previous = currentUrl;
    switching = true;
    host.setAttribute('aria-busy', 'true');
    feedback('[data-student-list-feedback]', '正在打开学员资料…');
    try {
      const response = await win.fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error('暂时无法读取学员资料。');
      const html = await response.text();
      const next = new win.DOMParser().parseFromString(html, 'text/html');
      const nextHost = next.querySelector<HTMLElement>('[data-student-detail-host]');
      if (!nextHost || (url.searchParams.has('uid') && !nextHost.querySelector('[data-student-editor]'))) {
        throw new Error('身份验证可能已过期，请在另一个窗口完成验证后重试。当前修改已保留。');
      }
      host.replaceChildren(...[...nextHost.childNodes].map((node) => doc.importNode(node, true)));
      const nextNotes = all<HTMLElement>('[data-student-note]', next);
      all<HTMLElement>('[data-student-note]').forEach((note) => {
        const fresh = nextNotes.find((item) => item.dataset.studentUid === note.dataset.studentUid);
        if (!fresh) return;
        note.replaceChildren(...[...fresh.childNodes].map((node) => doc.importNode(node, true)));
        Object.assign(note.dataset, fresh.dataset);
      });
      setUrl(url, push);
      initializeEditor();
      all<HTMLElement>('[data-student-note]').forEach((note) => {
        const selected = note.dataset.studentUid === url.searchParams.get('uid');
        note.classList.toggle('is-selected', selected);
        note.setAttribute('aria-expanded', `${selected}`);
      });
      filterRoster(true);
      feedback('[data-student-list-feedback]', '');
      if (win.innerWidth < 900) host.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return true;
    } catch (error) {
      if (!push) setUrl(new win.URL(previous));
      feedback('[data-student-list-feedback]', typeof (error as Error)?.message === 'string' ? (error as Error).message : '读取失败，请重试。', true);
      return false;
    } finally {
      switching = false;
      host.removeAttribute('aria-busy');
    }
  }
  function openModal(dialog: HTMLElement, opener: HTMLElement) {
    modalOpener = opener;
    dialog.hidden = false;
    doc.body.classList.add(dialog === addDialog ? 'student-create-dialog-open' : 'student-domain-dialog-open');
    const first = query<HTMLElement>('[data-student-add-first-field]', dialog)
      || all<HTMLElement>('select, button:not([tabindex="-1"])', dialog).find((node) => !node.closest('[hidden]'));
    first?.focus();
  }
  function closeModal(dialog: HTMLElement) {
    if (pending.size) return;
    dialog.hidden = true;
    doc.body.classList.remove('student-create-dialog-open', 'student-domain-dialog-open');
    modalOpener?.focus();
  }
  function openDomainDialog(opener: HTMLElement, remove: boolean) {
    if (!guard()) return;
    const dialog = query<HTMLElement>('[data-student-domain-dialog]');
    if (!dialog) return;
    const domainId = opener.dataset.domainId || '';
    const domainName = opener.dataset.domainName || domainId;
    const name = dialog.dataset.studentName;
    const select = query<HTMLSelectElement>('[data-student-domain-select]', dialog);
    const operation = query<HTMLInputElement>('[data-student-domain-operation]', dialog);
    operation.value = remove ? 'remove_student_domain' : 'add_student_domain';
    query<HTMLInputElement>('[data-student-domain-code]', dialog).value = remove ? domainId : '';
    query<HTMLElement>('[data-student-domain-title]', dialog).textContent = remove ? '从课堂移除学员' : '加入新课堂';
    query<HTMLElement>('[data-student-domain-description]', dialog).textContent = remove
      ? `将 ${name} 从「${domainName}」移除？`
      : `为 ${name} 选择一个新的学习课堂。`;
    query<HTMLElement>('[data-student-domain-note]', dialog).textContent = remove
      ? '已有提交与学习数据会保留；如果移除默认域，系统会为学员选择其他已加入的域。'
      : '加入后保留当前默认登录域，可在基本资料中调整。';
    query<HTMLElement>('[data-student-domain-field]', dialog).hidden = remove;
    const selected = query<HTMLElement>('[data-student-domain-selected]', dialog);
    selected.hidden = !remove;
    selected.textContent = domainName;
    const confirm = query<HTMLButtonElement>('[data-student-domain-confirm]', dialog);
    confirm.textContent = remove ? '确认移除' : '加入课堂';
    confirm.disabled = remove && Number(dialog.dataset.studentJoinedCount) <= 1;
    feedback('[data-student-domain-error]', confirm.disabled ? '学员至少需要保留一个域。' : '', true);
    const joined = all<HTMLInputElement>('[name="defaultDomain"]').map((input) => input.value);
    [...select.options].forEach((option) => {
      option.disabled = joined.includes(option.value);
    });
    select.value = '';
    select.required = !remove;
    openModal(dialog, opener);
  }
  async function post(body: FormData) {
    const response = await win.fetch(win.location.href, {
      method: 'POST',
      body,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('身份验证可能已过期，请在另一个窗口完成验证后重试。当前修改已保留。');
    }
    if (!response.ok || !result.saved) throw new Error(result.error?.message || result.message || '保存未完成，请重试。');
    return result;
  }
  async function saveForm(form: HTMLFormElement) {
    if (pending.has(form)) return;
    const isDomain = form.matches('[data-student-domain-form]');
    const isAdd = form === addForm;
    const errorSelector = isDomain ? '[data-student-domain-error]' : isAdd ? '[data-student-add-feedback]' : '[data-student-feedback]';
    if (isDomain) {
      const operation = query<HTMLInputElement>('[data-student-domain-operation]', form).value;
      if (operation === 'remove_student_domain' && query<HTMLButtonElement>('[data-student-domain-confirm]', form).disabled) return;
      if (operation === 'add_student_domain') {
        query<HTMLInputElement>('[data-student-domain-code]', form).value = query<HTMLSelectElement>(
          '[data-student-domain-select]',
          form,
        ).value;
      }
    }
    const password = query<HTMLInputElement>('[name="password"]', form);
    const verify = query<HTMLInputElement>('[name="verifyPassword"]', form);
    if (verify) {
      verify.setCustomValidity(password.value === verify.value ? '' : '两次输入的密码不一致。');
    }
    if (!form.reportValidity()) return;
    const body = new win.FormData(form);
    const saving = snapshot(form);
    const buttons = all<HTMLButtonElement>('button[type="submit"]', form);
    const savedLabels = buttons.map((button) => button.textContent);
    pending.add(form);
    buttons.forEach((button) => {
      button.disabled = true;
      button.textContent = '正在保存…';
    });
    feedback(errorSelector, '');
    try {
      const result = await post(body);
      baselines.set(form, saving);
      if (isAdd) {
        const destination = withViewState(result.url || result.redirect || win.location.href);
        if (result.uid) destination.searchParams.set('uid', `${result.uid}`);
        navigateConfirmed(destination);
      } else if (isDomain) {
        pending.delete(form);
        closeModal(query<HTMLElement>('[data-student-domain-dialog]'));
        await switchStudent(withViewState(win.location.href), false, true);
      } else {
        if (password) {
          form.reset();
          remember(form);
        } else {
          const uid = query<HTMLInputElement>('[name="uid"]', form).value;
          const note = all<HTMLElement>('[data-student-note]').find((item) => item.dataset.studentUid === uid);
          const name = `${body.get('displayName')}`;
          if (note) query<HTMLElement>('[data-student-display-name]', note).textContent = name;
          query<HTMLElement>('.student-management__editor-heading h2').textContent = name;
        }
        feedback(errorSelector, password ? '登录密码已重置。' : '学员信息已保存。');
      }
    } catch (error) {
      feedback(errorSelector, typeof (error as Error)?.message === 'string' ? (error as Error).message : '保存失败，请重试。', true);
    } finally {
      pending.delete(form);
      buttons.forEach((button, index) => {
        button.disabled = false;
        button.textContent = savedLabels[index];
      });
    }
  }
  function submitSort() {
    if (!guard()) {
      query<HTMLSelectElement>('[data-student-sort-select]').value = new win.URL(win.location.href).searchParams.get('sort') || 'submit';
      return;
    }
    const url = withViewState(win.location.href);
    url.searchParams.set('sort', query<HTMLSelectElement>('[data-student-sort-select]').value);
    url.searchParams.set('order', query<HTMLInputElement>('[data-student-sort-order]').value);
    navigateConfirmed(url);
  }
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const note = target.closest<HTMLAnchorElement>('[data-student-note]');
    if (note && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      if (note.dataset.studentUid !== query<HTMLElement>('[data-student-editor]')?.dataset.studentUid) {
        const url = withViewState(note.href);
        url.searchParams.set('uid', note.dataset.studentUid);
        switchStudent(url);
      }
    }
    const tab = target.closest<HTMLElement>('[data-student-tab]');
    if (tab) activateTab(tab.dataset.studentTab);
    if (target.closest('[data-student-clear-filters]')) {
      search.value = '';
      domainFilter.value = '';
      quizFilter.value = '';
      filterRoster();
    }
    const remove = target.closest<HTMLElement>('[data-student-domain-remove]');
    if (remove) openDomainDialog(remove, true);
    const addDomain = target.closest<HTMLElement>('[data-student-domain-add-open]');
    if (addDomain) openDomainDialog(addDomain, false);
    if (target.closest('[data-student-domain-close]')) closeModal(query<HTMLElement>('[data-student-domain-dialog]'));
    const add = target.closest<HTMLElement>('[data-student-add-open]');
    if (add && guard()) openModal(addDialog, add);
    if (target.closest('[data-student-add-close]')) closeModal(addDialog);
    const cancel = target.closest<HTMLAnchorElement>('[data-student-editor-cancel]');
    if (cancel) {
      event.preventDefault();
      const url = withViewState(cancel.href);
      url.searchParams.delete('uid');
      switchStudent(url);
    }
    if (target.closest('[data-student-sort-direction]')) {
      if (!guard()) return;
      const order = query<HTMLInputElement>('[data-student-sort-order]');
      order.value = order.value === 'asc' ? 'desc' : 'asc';
      query<HTMLElement>('[data-student-sort-arrow]').textContent = order.value === 'asc' ? '↑' : '↓';
      const url = withViewState(win.location.href);
      url.searchParams.set('order', order.value);
      url.searchParams.set('sort', query<HTMLSelectElement>('[data-student-sort-select]').value);
      navigateConfirmed(url);
    }
  });
  root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    if (form.matches('[data-student-profile-form], [data-student-password-form], [data-student-domain-form], [data-student-add-form]')) {
      event.preventDefault();
      saveForm(form);
    }
    if (form.matches('[data-student-sort-form]')) {
      event.preventDefault();
      submitSort();
    }
  });
  root.addEventListener(
    'invalid',
    (event) => {
      const target = event.target as HTMLElement;
      const panel = target.closest<HTMLElement>('[data-student-panel]');
      if (panel?.hidden) activateTab(panel.dataset.studentPanel);
    },
    true,
  );
  root.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'password' || target.name === 'verifyPassword') {
      query<HTMLInputElement>('[name="verifyPassword"]', target.form)?.setCustomValidity('');
    }
  });
  doc.addEventListener('keydown', (event) => {
    const dialog = query<HTMLElement>('[data-student-add-dialog]:not([hidden]), [data-student-domain-dialog]:not([hidden])');
    if (dialog) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(dialog);
      }
      if (event.key === 'Tab') {
        const controls = all<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), input:not([type="hidden"]):not([disabled]), select:not([disabled])',
          dialog,
        ).filter((node) => !node.closest('[hidden]'));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-student-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const values = ['profile', 'learning', 'daily'];
      const index = values.indexOf(tab.dataset.studentTab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      activateTab(values[next], true);
    }
  });
  win.addEventListener('beforeunload', (event) => {
    if (confirmedNavigation) {
      confirmedNavigation = false;
      return;
    }
    if (isDirty() || pending.size || daily.isPending()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  win.addEventListener('popstate', () => {
    const requested = new win.URL(win.location.href);
    if (!guard()) {
      setUrl(new win.URL(currentUrl), true);
      return;
    }
    switchStudent(requested, false, true);
  });
  search.addEventListener('input', () => filterRoster());
  domainFilter.addEventListener('change', () => filterRoster());
  quizFilter.addEventListener('change', () => filterRoster());
  query<HTMLSelectElement>('[data-student-sort-select]').addEventListener('change', submitSort);
  remember(addForm);
  filterRoster(true);
  initializeEditor();
  currentUrl = win.location.href;
}
