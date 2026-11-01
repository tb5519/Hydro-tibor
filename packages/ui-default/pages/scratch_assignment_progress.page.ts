import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('scratch_assignment', () => {
  const panel = document.querySelector<HTMLElement>('[data-assignment-progress]');
  if (!panel) return;
  const rows = [...panel.querySelectorAll<HTMLElement>('[data-progress-row]')];
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-progress-filter]')];
  const search = panel.querySelector<HTMLInputElement>('[data-progress-search]');
  const empty = panel.querySelector<HTMLElement>('[data-progress-empty]');
  const count = panel.querySelector<HTMLElement>('[data-progress-count]');
  let filter = 'all';
  const update = () => {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of rows) {
      const historical = row.dataset.historical === 'true';
      const matches = filter === 'history' ? historical : !historical && (filter === 'all' || (filter === 'pending' && row.dataset.pending === 'true')
        || (filter === 'changes' && row.dataset.changesRequested === 'true')
        || (filter === 'completed' && row.dataset.completed === 'true')
        || (filter === 'incomplete' && row.dataset.completed !== 'true'));
      row.hidden = !matches || !(row.dataset.name || '').toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    }
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.progressFilter === filter)));
    if (empty) empty.hidden = visible > 0 || rows.length === 0;
    if (count) count.textContent = `${visible} 位学员`;
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.progressFilter || 'all';
    update();
  }));
  document.querySelectorAll<HTMLElement>('[data-progress-quick]').forEach((link) => link.addEventListener('click', () => {
    filter = link.dataset.progressQuick || 'all';
    if (search) search.value = '';
    update();
  }));
  search?.addEventListener('input', update);
  update();
});
