import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['scratch_assignment_create', 'scratch_assignment_edit'], () => {
  const form = document.querySelector<HTMLFormElement>('[data-scratch-assignment-form]');
  if (!form) return;
  const modes = [...form.querySelectorAll<HTMLInputElement>('input[name=assignmentMode]')];
  const project = form.querySelector<HTMLElement>('[data-assignment-project]');
  const objective = form.querySelector<HTMLElement>('[data-assignment-objective]');
  const template = form.querySelector<HTMLInputElement>('input[name=template]');
  let papers: HTMLInputElement[] = [];
  let summary: HTMLElement | null;
  let hint: HTMLElement | null;
  const readLibrary = () => {
    papers = [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]')];
    summary = form.querySelector<HTMLElement>('[data-assignment-selection-summary]');
    hint = form.querySelector<HTMLElement>('[data-assignment-selection-hint]');
  };
  readLibrary();
  const validation = form.querySelector<HTMLElement>('[data-assignment-validation]');
  const refresh = form.querySelector<HTMLButtonElement>('[data-assignment-refresh]');
  const refreshStatus = form.querySelector<HTMLElement>('[data-assignment-refresh-status]');
  let request: AbortController | null = null;
  const publishSummary = form.querySelector<HTMLElement>('[data-assignment-publish-summary]');
  const currentMode = () => modes.find((input) => input.checked)?.value || 'project';
  const selected = () => papers.filter((input) => input.checked);
  const questionCount = () => selected().reduce((total, input) => total + Number(input.dataset.questionCount || 0), 0);
  const selectionError = () => {
    if (currentMode() === 'project') return '';
    if (!selected().length) return '请至少选择一份客观题卷，再发布作业。';
    if (selected().some((input) => input.dataset.unavailable)) return '有已选题卷不再可用，请取消选择后再发布作业。';
    if (selected().length > 10) return '一份作业最多选择 10 份题卷，请减少所选题卷。';
    if (questionCount() > 100) return '一份作业最多包含 100 道题，请减少所选题卷。';
    return '';
  };
  const showError = (message: string) => {
    if (!validation) return;
    validation.textContent = message;
    validation.hidden = !message;
  };
  const update = () => {
    const mode = currentMode();
    const includesProject = mode !== 'objective';
    const includesObjective = mode !== 'project';
    if (project) project.hidden = !includesProject;
    if (objective) objective.hidden = !includesObjective;
    if (template) template.disabled = !includesProject;
    papers.forEach((input) => { input.disabled = !includesObjective; });
    const chosen = selected();
    const score = chosen.reduce((total, input) => total + Number(input.dataset.totalScore || 0), 0);
    if (summary) summary.textContent = chosen.length ? `已选 ${chosen.length} 份 · ${questionCount()} 题 · ${score} 分` : '请选择题卷';
    if (hint) hint.textContent = chosen.length ? '发布后，每位孩子都会收到这份练习。' : '可组合多份题卷，组成这次的小练习。';
    if (publishSummary) {
      const content = includesObjective ? `${includesProject ? '一份 Scratch 作品 + ' : ''}${questionCount()} 道客观题` : '一份 Scratch 作品';
      publishSummary.textContent = `本次作业：${content}。`;
    }
    showError(chosen.length ? selectionError() : '');
  };
  form.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (['assignmentMode', 'objectivePaperIds'].includes(input.name)) update();
  });
  form.addEventListener('input', (event) => {
    const search = event.target as HTMLInputElement;
    if (!search.matches('[data-assignment-search]')) return;
    const query = search.value.trim().toLocaleLowerCase();
    const empty = form.querySelector<HTMLElement>('[data-assignment-no-results]');
    let visible = 0;
    form.querySelectorAll<HTMLElement>('[data-assignment-paper]').forEach((row) => {
      row.hidden = !(row.dataset.search || '').toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  });
  refresh?.addEventListener('click', async () => {
    if (request) return;
    request = new AbortController();
    const timer = setTimeout(() => request?.abort(), 20000);
    refresh.disabled = true;
    if (refreshStatus) refreshStatus.textContent = '正在更新题卷…';
    try {
      const response = await fetch(location.href, { credentials: 'same-origin', cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error('题卷列表暂时无法更新，请重试。');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('[data-assignment-library]');
      const current = form.querySelector('[data-assignment-library]');
      if (!next || !current) throw new Error('题卷列表暂时无法更新，请重试。');
      const selectedIds = new Set(selected().map((input) => input.value));
      const missing = selected().filter((input) => ![...next.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]')]
        .some((item) => item.value === input.value));
      if (missing.length) {
        let list = next.querySelector('[data-assignment-papers]');
        if (!list) {
          list = document.createElement('div');
          list.className = 'sc-assignment-papers';
          list.setAttribute('data-assignment-papers', '');
          next.appendChild(list);
        }
        for (const input of missing) {
          const row = input.closest<HTMLElement>('[data-assignment-paper]')?.cloneNode(true) as HTMLElement | undefined;
          const copy = row?.querySelector<HTMLInputElement>('input');
          if (!row || !copy) continue;
          row.hidden = false;
          copy.dataset.unavailable = 'true';
          const meta = row.querySelector<HTMLElement>('.sc-assignment-paper-meta');
          if (meta) meta.textContent = '这份题卷已不可用，请取消选择';
          list.appendChild(row);
        }
      }
      next.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]').forEach((input) => {
        input.checked = selectedIds.has(input.value);
      });
      current.replaceWith(document.importNode(next, true));
      readLibrary();
      update();
      const unavailable = missing.length;
      if (refreshStatus) {
        refreshStatus.textContent = unavailable
          ? `列表已更新；${unavailable} 份已选题卷已不可用，已保留在列表中，请取消选择。`
          : '题卷已更新，正在填写的作业内容已保留。';
      }
    } catch (error) {
      if (refreshStatus) refreshStatus.textContent = error.name === 'AbortError' ? '更新超时，请重试。' : '题卷列表暂时无法更新，请重试。';
    } finally {
      clearTimeout(timer);
      request = null;
      refresh.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => request?.abort());
  form.addEventListener('submit', (event) => {
    const message = selectionError();
    if (!message) return;
    event.preventDefault();
    showError(message);
    validation?.focus();
  });
  update();
});
