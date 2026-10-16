type LanguageOption = { id: string; name: string };
type Policy = {
  version: number;
  mode: 'unrestricted' | 'global' | 'per-domain';
  languages: string[];
  domains: { domainId: string; languages: string[] }[];
};

export function bindStudentSubmissionLanguage(editor: HTMLElement) {
  const root = editor.querySelector<HTMLElement>('[data-student-language]');
  if (!root) return { validate: () => '', isDirty: () => false, markSaved: (_value: string) => {} };
  const doc = root.ownerDocument;
  const field = root.querySelector<HTMLInputElement>('[name="submissionLanguagePolicy"]');
  const initial: Policy = JSON.parse(field.value);
  const options: LanguageOption[] = JSON.parse(root.dataset.languageOptions || '[]');
  const modes = [...root.querySelectorAll<HTMLInputElement>('[name="studentSubmissionLanguageMode"]')];
  const global = root.querySelector<HTMLElement>('[data-language-global]');
  const domains = root.querySelector<HTMLElement>('[data-language-domains]');
  const rows = [...root.querySelectorAll<HTMLElement>('[data-language-domain]')];
  const group = root.querySelector<HTMLElement>('[data-language-picker="global"]');
  const create = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const selected = (picker: HTMLElement) => [...picker.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')]
    .map((input) => input.value);
  function buildPicker(picker: HTMLElement, values: string[], label: string) {
    const search = create('input', 'textbox student-language__search');
    search.type = 'search';
    search.placeholder = '搜索语言或版本…';
    search.setAttribute('aria-label', `${label}：搜索语言`);
    const summary = create('div', 'student-language__selected');
    summary.dataset.languageSelected = '';
    const list = create('div', 'student-language__options');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', `${label}：允许的语言`);
    const entries = [...options, ...values.filter((id) => !options.some((option) => option.id === id))
      .map((id) => ({ id, name: `${id}（暂不可用，请重新选择）` }))];
    entries.forEach((option) => {
      const choice = create('label', 'student-language__choice');
      const input = create('input', '');
      input.type = 'checkbox';
      input.value = option.id;
      input.checked = values.includes(option.id);
      choice.append(input, create('span', '', option.name));
      list.append(choice);
    });
    const empty = create('p', 'student-language__empty', options.length ? '没有匹配的语言，请换个关键词。' : '暂时没有可配置的编程语言。');
    empty.hidden = entries.length > 0;
    search.addEventListener('input', () => {
      let count = 0;
      list.querySelectorAll<HTMLElement>('label').forEach((choice) => {
        const input = choice.querySelector<HTMLInputElement>('input');
        choice.hidden = !`${input.value} ${choice.textContent}`.toLowerCase().includes(search.value.trim().toLowerCase());
        if (!choice.hidden) count++;
      });
      empty.hidden = count > 0;
    });
    picker.append(summary, search, list, empty);
  }
  buildPicker(group, initial.languages || [], '所有域');
  rows.forEach((row) => {
    const saved = initial.domains?.find((item) => item.domainId === row.dataset.languageDomain);
    row.querySelector<HTMLSelectElement>('[data-language-domain-mode]').value = saved ? 'restricted' : 'unrestricted';
    buildPicker(row.querySelector('[data-language-picker]'), saved?.languages || [], row.dataset.domainName);
  });
  modes.forEach((input) => { input.checked = input.value === initial.mode; });
  function update() {
    const mode = modes.find((input) => input.checked)?.value as Policy['mode'] || 'unrestricted';
    global.hidden = mode !== 'global';
    domains.hidden = mode !== 'per-domain';
    const policy: Policy = { version: 1, mode, languages: mode === 'global' ? selected(group) : [], domains: [] };
    rows.forEach((row) => {
      const restricted = row.querySelector<HTMLSelectElement>('[data-language-domain-mode]').value === 'restricted';
      const picker = row.querySelector<HTMLElement>('[data-language-picker]');
      picker.hidden = !restricted;
      if (mode === 'per-domain' && restricted) policy.domains.push({ domainId: row.dataset.languageDomain, languages: selected(picker) });
    });
    root.querySelectorAll<HTMLElement>('[data-language-picker]').forEach((picker) => {
      const values = selected(picker);
      const summary = picker.querySelector<HTMLElement>('[data-language-selected]');
      summary.replaceChildren();
      if (!values.length) summary.textContent = '尚未选择，请至少勾选一种语言';
      values.forEach((id) => summary.append(create('span', 'student-language__chip', options.find((item) => item.id === id)?.name || id)));
    });
    root.querySelector<HTMLElement>('[data-language-summary]').textContent = mode === 'unrestricted'
      ? '当前不额外限制，该学员可使用题目允许的语言。'
      : mode === 'global' ? `所有域统一使用所选的 ${policy.languages.length} 种语言，包括以后加入的域。`
        : `已单独设置 ${policy.domains.length} 个域，其余域不额外限制。`;
    field.value = JSON.stringify(policy);
  }
  root.addEventListener('change', update);
  update();
  let baseline = field.value;
  return {
    isDirty: () => field.value !== baseline,
    markSaved: (value: string) => { baseline = value; },
    validate() {
      const policy: Policy = JSON.parse(field.value);
      if (policy.mode === 'global' && !policy.languages.length) return '请为所有域至少选择一种允许提交的语言。';
      const empty = policy.domains.find((item) => !item.languages.length);
      if (empty) return `请为「${rows.find((row) => row.dataset.languageDomain === empty.domainId)?.dataset.domainName || empty.domainId}」至少选择一种语言。`;
      const ids = [...policy.languages, ...policy.domains.flatMap((item) => item.languages)];
      if (ids.some((id) => !options.some((option) => option.id === id))) return '所选语言已不可用，请重新选择后保存。';
      return '';
    },
  };
}
