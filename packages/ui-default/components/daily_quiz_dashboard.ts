import { bindDailyQuizLearning, learningAccuracy, type LearningSummary, type QuizLearning } from './daily_quiz_learning';

interface DashboardRow extends LearningSummary {
  uid: number;
  name: string;
  uname: string;
  avatar?: string;
  domainNames: string[];
  enabled: boolean;
  tags: string[];
  lastAnsweredAt: string | null;
  detailUrl: string;
  settingsUrl: string;
}
interface QuizDashboard {
  classroom: string;
  domains: { id: string, name: string }[];
  stats: LearningSummary & { students: number, participants: number };
  rows: DashboardRow[];
}
type RosterFilter = 'all' | 'wrong' | 'participated' | 'unanswered';
interface DetailState {
  status: 'loading' | 'loaded' | 'error';
  learning?: QuizLearning;
  error?: string;
  controller?: AbortController;
}
const filterLabels: [RosterFilter, string][] = [
  ['all', '全部学员'], ['wrong', '待复习'], ['participated', '已参与'], ['unanswered', '尚未作答'],
];

/** Current assigned-tag mastery, counting each source question once by its latest answer. */
export function bindDailyQuizDashboard(root: HTMLElement, win = root.ownerDocument.defaultView) {
  const doc = root.ownerDocument;
  const lifetime = new win.AbortController();
  const details = new Map<number, DetailState>();
  const learningViews = new Map<number, ReturnType<typeof bindDailyQuizLearning>>();
  let data: QuizDashboard;
  let filter: RosterFilter = 'all';
  let query = '';
  let expanded: number | null = null;
  let visibleLimit = 30;
  let disposed = false;
  let scopeRequest: AbortController | null = null;
  let generation = 0;
  let failedScope: string | null = null;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(text: string, action: string, className = 'dqd-button') {
    const node = el('button', className, text);
    node.type = 'button';
    node.dataset.quizAction = action;
    return node;
  }
  function safeUrl(value: string, sameOrigin = true) {
    try {
      const url = new win.URL(value, win.location.href);
      if (!['https:', 'http:'].includes(url.protocol) || (sameOrigin && url.origin !== win.location.origin)) return '';
      return url.href;
    } catch { return ''; }
  }
  function verificationLink() {
    const link = el('a', 'dqd-link', '在新窗口验证身份');
    link.href = safeUrl(win.location.href);
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }
  function disposeViews() {
    learningViews.forEach((view) => view.dispose());
    learningViews.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    lifetime.abort();
    scopeRequest?.abort();
    details.forEach((state) => state.controller?.abort());
    details.clear();
    disposeViews();
  }
  try {
    data = JSON.parse(root.dataset.initial || '{}');
    if (!Array.isArray(data.rows) || !data.stats || !Array.isArray(data.domains)) throw new Error();
  } catch {
    root.replaceChildren(el('h1', '', '每日问答'), el('p', 'dqd-notice is-error', '概览暂时无法载入，请刷新页面重试。'));
    return { dispose };
  }
  root.replaceChildren();
  const header = el('header', 'dqd-header');
  const heading = el('div');
  const title = el('h1', '', '每日问答');
  title.dataset.heading = '';
  heading.append(el('p', 'dqd-eyebrow', '知识掌握概览'), title, el('p', 'dqd-subtitle', '围绕当前指定知识点，查看每位学员的掌握情况与待复习题目。'));
  const refresh = button('刷新数据', 'refresh', 'dqd-button dqd-button--quiet');
  header.append(heading, refresh);
  const controls = el('div', 'dqd-controls');
  const classroom = el('select');
  classroom.dataset.quizClassroom = '';
  classroom.setAttribute('aria-label', '筛选课堂');
  const scopeField = el('label', 'dqd-field');
  scopeField.append(el('span', '', '查看课堂'), classroom);
  controls.append(scopeField, el('p', 'dqd-mastery-note', '按学员累计统计当前出题范围；每位学员的重复题目只计一次，以最近作答结果为准。'));
  const feedback = el('div', 'dqd-notice');
  feedback.dataset.quizFeedback = '';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.hidden = true;
  const metrics = el('div', 'dqd-metrics');
  metrics.dataset.quizMetrics = '';
  const roster = el('section', 'dqd-roster');
  const rosterHeader = el('div', 'dqd-roster-header');
  const rosterHeading = el('div');
  const rosterTitle = el('h2', '', '学员知识掌握');
  rosterTitle.id = 'daily-quiz-roster-heading';
  rosterHeading.append(rosterTitle, el('p', '', '已开启问答的学员优先展示；展开即可查看错题、知识点与每次练习。'));
  const search = el('input', 'dqd-search');
  search.type = 'search';
  search.placeholder = '搜索姓名、用户名或 UID';
  search.dataset.quizSearch = '';
  search.setAttribute('aria-label', '搜索学员姓名、用户名或 UID');
  rosterHeader.append(rosterHeading, search);
  const tabs = el('div', 'dqd-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '筛选学员知识掌握情况');
  const tableWrap = el('div', 'dqd-table-wrap');
  const table = el('table', 'dqd-table');
  table.setAttribute('aria-labelledby', rosterTitle.id);
  const tableHead = el('thead');
  const headRow = el('tr');
  ['学员', '答题进度', '答对 / 待复习', '正确率', '参与', '详情'].forEach((text) => {
    const cell = el('th', '', text);
    cell.scope = 'col';
    headRow.append(cell);
  });
  tableHead.append(headRow);
  const tableBody = el('tbody');
  tableBody.dataset.quizRows = '';
  table.append(tableHead, tableBody);
  tableWrap.append(table);
  const empty = el('div', 'dqd-empty');
  empty.hidden = true;
  const rosterFooter = el('div', 'dqd-roster-footer');
  const rowCount = el('span');
  rowCount.dataset.quizRowCount = '';
  rowCount.setAttribute('role', 'status');
  const showMore = button('再显示 30 名学员', 'show-more', 'dqd-button dqd-button--small');
  showMore.hidden = true;
  rosterFooter.append(rowCount, showMore, el('span', 'dqd-scope-note', '正确率 = 最近答对题数 / 已答题数；未答题不计入。筛选不改变上方汇总。'));
  roster.append(rosterHeader, tabs, tableWrap, empty, rosterFooter);
  root.append(header, controls, feedback, metrics, roster);

  function showFeedback(message: string, error = false, retry = false) {
    feedback.replaceChildren(el('span', '', message));
    feedback.hidden = !message;
    feedback.classList.toggle('is-error', error);
    if (retry) feedback.append(button('重新加载', 'retry-scope', 'dqd-button dqd-button--small'));
    if (error && message.includes('身份验证')) feedback.append(verificationLink());
  }
  function syncScopeControls() {
    classroom.replaceChildren();
    const all = el('option', '', '全部课堂');
    all.value = '';
    classroom.append(all);
    data.domains.forEach((domain) => {
      const option = el('option', '', domain.name);
      option.value = domain.id;
      classroom.append(option);
    });
    classroom.value = data.classroom || '';
  }
  function renderMetrics() {
    metrics.replaceChildren();
    const stats = data.stats;
    const entries = [
      ['最近答对', `${stats.correctCount}`, '题', `学员合计已答 ${stats.answered} / 分配 ${stats.total} 题`, 'teal'],
      ['答错待复习', `${stats.wrongCount}`, '题', `${data.rows.filter((row) => row.wrongCount > 0).length} 名学员有需要巩固的题目`, 'amber'],
      ['答题正确率', learningAccuracy(stats.correctCount, stats.answered), '', `答对 ${stats.correctCount} / 已答 ${stats.answered} 题`, 'teal'],
      ['累计参与', `${stats.participationCount}`, '次', `${stats.participants} 名学员参与 · 共 ${stats.students} 名学员`, 'blue'],
    ];
    entries.forEach(([label, value, unit, note, tone]) => {
      const card = el('div', `dqd-metric dqd-metric--${tone}`);
      const number = el('div', 'dqd-metric-value');
      number.append(el('strong', '', value), el('span', '', unit));
      card.append(el('p', 'dqd-metric-label', label), number, el('p', 'dqd-metric-note', note));
      metrics.append(card);
    });
  }
  function matches(row: DashboardRow, value: RosterFilter) {
    return value === 'all' || (value === 'wrong' && row.wrongCount > 0)
      || (value === 'participated' && row.participationCount > 0) || (value === 'unanswered' && row.answered === 0);
  }
  function renderTabs() {
    tabs.replaceChildren();
    filterLabels.forEach(([key, text]) => {
      const tab = button(text, 'filter', 'dqd-tab');
      tab.dataset.quizFilter = key;
      tab.setAttribute('aria-pressed', `${filter === key}`);
      tab.append(el('span', 'dqd-tab-count', `${data.rows.filter((row) => matches(row, key)).length}`));
      tabs.append(tab);
    });
  }
  function cell(label: string, className = '') {
    const node = el('td', className);
    node.dataset.label = label;
    return node;
  }
  function renderRows() {
    const lowered = query.trim().toLocaleLowerCase();
    const matchingRows = data.rows.filter((row) => matches(row, filter)
      && (!lowered || `${row.name} ${row.uname} ${row.uid}`.toLocaleLowerCase().includes(lowered)))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.wrongCount - a.wrongCount
        || b.answered - a.answered || a.name.localeCompare(b.name, 'zh-CN'));
    const rows = matchingRows.slice(0, visibleLimit);
    disposeViews();
    tableBody.replaceChildren();
    rows.forEach((row) => {
      const tr = el('tr', expanded === row.uid ? 'dqd-student-row is-expanded' : 'dqd-student-row');
      tr.dataset.quizStudent = `${row.uid}`;
      const student = cell('学员', 'dqd-student-cell');
      const identity = el('div', 'dqd-identity');
      const avatar = el('span', 'dqd-avatar', (row.name || row.uname || '?').slice(0, 1));
      const avatarUrl = row.avatar && safeUrl(row.avatar, false);
      if (avatarUrl) {
        const img = el('img');
        img.src = avatarUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), { once: true });
        avatar.append(img);
      }
      const name = el('div', 'dqd-name');
      name.append(el('strong', '', row.name || row.uname), el('small', '', `@${row.uname} · ${row.uid}`));
      if (row.domainNames?.length) name.append(el('small', 'dqd-domain-names', row.domainNames.join(' / ')));
      identity.append(avatar, name);
      student.append(identity);
      const progress = cell('答题进度', 'dqd-progress-cell');
      const progressLabel = el('div', 'dqd-progress-label');
      progressLabel.append(el('span', 'dqd-progress-numbers', `已答 ${row.answered} / ${row.total} 题`));
      if (!row.enabled) progressLabel.append(el('span', 'dqd-paused', '练习已暂停'));
      progress.append(progressLabel);
      if (row.total > 0) {
        const bar = el('div', 'dqd-progress-track');
        bar.setAttribute('aria-hidden', 'true');
        const fill = el('span');
        fill.style.width = `${Math.min(100, Math.max(0, row.answered / row.total * 100))}%`;
        bar.append(fill);
        progress.append(bar);
      }
      const outcomes = cell('答对 / 待复习', 'dqd-outcomes');
      if (row.answered > 0) outcomes.append(el('span', 'dqd-correct', `${row.correctCount}`), el('span', 'dqd-divider', '/'), el('span', row.wrongCount ? 'dqd-wrong' : '', `${row.wrongCount}`));
      else outcomes.textContent = '--';
      const rate = cell('正确率', 'dqd-number');
      rate.textContent = learningAccuracy(row.correctCount, row.answered);
      const participation = cell('参与练习', 'dqd-number');
      participation.textContent = `${row.participationCount} 次`;
      const action = cell('详情', 'dqd-action-cell');
      const toggle = button(expanded === row.uid ? '收起 ↑' : '查看详情 ↓', 'detail', 'dqd-detail-toggle');
      toggle.dataset.quizUid = `${row.uid}`;
      toggle.setAttribute('aria-expanded', `${expanded === row.uid}`);
      toggle.setAttribute('aria-controls', `daily-quiz-detail-${row.uid}`);
      toggle.setAttribute('aria-label', `${expanded === row.uid ? '收起' : '查看'}${row.name || row.uname}的知识掌握详情`);
      toggle.disabled = !!scopeRequest;
      action.append(toggle);
      tr.append(student, progress, outcomes, rate, participation, action);
      tableBody.append(tr);
      if (expanded === row.uid) {
        const detailRow = el('tr', 'dqd-detail-row');
        const detailCell = el('td');
        detailCell.colSpan = 6;
        const panel = el('div', 'dqd-detail-panel');
        panel.id = `daily-quiz-detail-${row.uid}`;
        panel.dataset.quizDetailPanel = `${row.uid}`;
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', `${row.name || row.uname}的知识掌握详情`);
        renderDetail(row, panel);
        detailCell.append(panel);
        detailRow.append(detailCell);
        tableBody.append(detailRow);
      }
    });
    rowCount.textContent = `显示 ${rows.length} / ${matchingRows.length} 名学员${matchingRows.length !== data.rows.length ? ` · 范围内共 ${data.rows.length} 人` : ''}`;
    showMore.hidden = rows.length >= matchingRows.length;
    tableWrap.hidden = !rows.length;
    empty.hidden = !!rows.length;
    if (!rows.length) {
      empty.replaceChildren(el('strong', '', data.rows.length ? '没有符合条件的学员' : '这个范围暂无学员'), el('p', '', data.rows.length ? '试试其他筛选，或调整搜索内容。' : '选择其他课堂，或先在学员管理中添加学员。'));
      if (data.rows.length) empty.append(button('清除筛选', 'clear', 'dqd-button dqd-button--small'));
    }
  }
  function renderDetail(row: DashboardRow, panel: HTMLElement) {
    learningViews.get(row.uid)?.dispose();
    learningViews.delete(row.uid);
    panel.replaceChildren();
    const state = details.get(row.uid);
    const detailHeader = el('div', 'dqd-detail-header');
    const settings = el('a', 'dqd-link', '问答设置');
    settings.href = safeUrl(row.settingsUrl) || '#';
    detailHeader.append(el('h3', '', `${row.name || row.uname} · 知识掌握详情`), settings);
    panel.append(detailHeader);
    panel.setAttribute('aria-busy', `${!state || state.status === 'loading'}`);
    if (!state || state.status === 'loading') {
      const loading = el('p', 'dqd-detail-message', '正在整理已答题目与知识点掌握情况…');
      loading.setAttribute('role', 'status');
      panel.append(loading);
    } else if (state.status === 'error') {
      const error = el('div', 'dqd-detail-message is-error');
      error.setAttribute('role', 'alert');
      const retry = button('重试', 'retry-detail', 'dqd-button dqd-button--small');
      retry.dataset.quizUid = `${row.uid}`;
      error.append(el('span', '', state.error), retry);
      if (state.error.includes('身份验证')) error.append(verificationLink());
      panel.append(error);
    } else {
      const content = el('div', 'dqd-learning-host');
      panel.append(content);
      learningViews.set(row.uid, bindDailyQuizLearning(content, state.learning));
    }
  }
  function updateDetail(row: DashboardRow) {
    const panel = root.querySelector<HTMLElement>(`[data-quiz-detail-panel="${row.uid}"]`);
    if (panel) renderDetail(row, panel);
  }
  async function readJson(url: string, signal: AbortSignal) {
    const response = await win.fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? '身份验证可能已过期，请验证后重试。' : '暂时无法读取数据，请稍后重试。');
    try { return await response.json(); } catch { throw new Error('身份验证可能已过期，请验证后重试。'); }
  }
  async function loadDetail(row: DashboardRow) {
    if (disposed || scopeRequest) return;
    details.get(row.uid)?.controller?.abort();
    const controller = new win.AbortController();
    const version = generation;
    const state: DetailState = { status: 'loading', controller };
    details.set(row.uid, state);
    updateDetail(row);
    try {
      const url = safeUrl(row.detailUrl);
      if (!url) throw new Error('详情暂时无法读取，请刷新概览后重试。');
      const result = await readJson(url, controller.signal);
      if (!result.learning?.summary || !Array.isArray(result.learning.questions)) throw new Error('详情暂时无法读取，请稍后重试。');
      if (disposed || version !== generation || controller.signal.aborted || details.get(row.uid) !== state) return;
      state.status = 'loaded';
      state.learning = result.learning;
      state.controller = null;
      updateDetail(row);
    } catch (error) {
      if (disposed || version !== generation || controller.signal.aborted || details.get(row.uid) !== state) return;
      state.status = 'error';
      state.error = error instanceof Error ? error.message : '读取失败，请重试。';
      state.controller = null;
      updateDetail(row);
    }
  }
  async function loadScope(selectedClassroom: string) {
    if (disposed) return;
    scopeRequest?.abort();
    const controller = new win.AbortController();
    scopeRequest = controller;
    generation += 1;
    details.forEach((state) => state.controller?.abort());
    showFeedback('正在整理所选课堂的知识掌握情况…');
    roster.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    root.querySelectorAll<HTMLButtonElement>('[data-quiz-action="detail"]').forEach((control) => { control.disabled = true; });
    const url = new win.URL(win.location.href);
    url.searchParams.delete('day');
    if (selectedClassroom) url.searchParams.set('classroom', selectedClassroom);
    else url.searchParams.delete('classroom');
    try {
      const result = await readJson(url.href, controller.signal);
      if (!result.dashboard?.stats || !Array.isArray(result.dashboard?.rows) || !Array.isArray(result.dashboard?.domains)) throw new Error('概览数据暂时无法读取，请重试。');
      if (disposed || scopeRequest !== controller || controller.signal.aborted) return;
      data = result.dashboard;
      expanded = null;
      visibleLimit = 30;
      details.clear();
      failedScope = null;
      win.history.replaceState(win.history.state, '', url.href);
      syncScopeControls();
      renderMetrics();
      renderTabs();
      showFeedback('');
    } catch (error) {
      if (disposed || scopeRequest !== controller || controller.signal.aborted) return;
      failedScope = selectedClassroom;
      details.forEach((state, uid) => { if (state.status === 'loading') details.delete(uid); });
      expanded = null;
      syncScopeControls();
      showFeedback(`${error instanceof Error ? error.message : '读取失败，请重试。'} 当前保留上次读取的数据。`, true, true);
    } finally {
      if (!disposed && scopeRequest === controller) {
        scopeRequest = null;
        roster.removeAttribute('aria-busy');
        refresh.disabled = false;
        renderRows();
      }
    }
  }
  root.addEventListener('click', (event) => {
    const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-quiz-action]');
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.quizAction;
    if (action === 'refresh') loadScope(data.classroom);
    else if (action === 'retry-scope' && failedScope !== null) loadScope(failedScope);
    else if (action === 'show-more') { visibleLimit += 30; renderRows(); }
    else if (action === 'filter' || action === 'clear') {
      filter = action === 'clear' ? 'all' : control.dataset.quizFilter as RosterFilter;
      visibleLimit = 30;
      if (action === 'clear') { query = ''; search.value = ''; }
      renderTabs();
      renderRows();
      tabs.querySelector<HTMLButtonElement>(`[data-quiz-filter="${filter}"]`)?.focus();
    } else if (action === 'detail' || action === 'retry-detail') {
      const uid = Number(control.dataset.quizUid);
      const row = data.rows.find((item) => item.uid === uid);
      if (!row) return;
      if (action === 'detail') {
        expanded = expanded === uid ? null : uid;
        renderRows();
        root.querySelector<HTMLButtonElement>(`[data-quiz-action="detail"][data-quiz-uid="${uid}"]`)?.focus();
        if (expanded === uid && !details.has(uid)) loadDetail(row);
      } else loadDetail(row);
    }
  }, { signal: lifetime.signal });
  search.addEventListener('input', () => { query = search.value; visibleLimit = 30; renderRows(); }, { signal: lifetime.signal });
  classroom.addEventListener('change', () => { loadScope(classroom.value); }, { signal: lifetime.signal });
  win.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { signal: lifetime.signal });
  syncScopeControls();
  renderMetrics();
  renderTabs();
  renderRows();
  return { dispose };
}
