import MarkdownIt from 'markdown-it';

type QuizStatus = 'completed' | 'inProgress' | 'notStarted' | 'noQuestions' | 'disabled' | 'unrecorded';
type RosterFilter = 'all' | 'pending' | 'completed' | 'wrong' | 'disabled';
interface DashboardRow {
  uid: number;
  name: string;
  uname: string;
  avatar?: string;
  domainNames: string[];
  enabled: boolean;
  status: QuizStatus;
  total: number;
  answered: number;
  correctCount: number;
  wrongCount: number;
  earnedPoints: number;
  accuracy: number | null;
  lastAnsweredAt: string | null;
  detailUrl: string;
  settingsUrl: string;
}
interface QuizDashboard {
  day: string;
  today: string;
  classroom: string;
  domains: { id: string, name: string }[];
  stats: {
    assigned: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    noQuestions: number;
    disabled: number;
    unrecorded: number;
    answered: number;
    correctCount: number;
    wrongCount: number;
    earnedPoints: number;
    accuracy: number | null;
  };
  rows: DashboardRow[];
  trend?: { day: string, answered: number, correctCount: number, accuracy: number | null, participants: number, completed: number }[];
}
interface ReportItem {
  id: string;
  index: number;
  domainName: string;
  title: string;
  stem: string;
  kind: string;
  tags: string[];
  options: string[];
  answers: string[];
  selected: string[] | null;
  correct: boolean | null;
  points: number;
  earnedPoints: number;
  analysis: string;
  answeredAt?: string;
}
interface QuizReport {
  day: string;
  total: number;
  answered: number;
  correctCount: number;
  wrongCount: number;
  earnedPoints: number;
  completed: boolean;
  items: ReportItem[];
}
interface DetailState {
  status: 'loading' | 'loaded' | 'error';
  filter: 'all' | 'wrong';
  report?: QuizReport;
  error?: string;
  controller?: AbortController;
}

const statusLabels: Record<QuizStatus, string> = {
  completed: '已完成',
  inProgress: '进行中',
  notStarted: '未开始',
  noQuestions: '暂无可答题',
  disabled: '未开启',
  unrecorded: '无记录',
};
const filterLabels: [RosterFilter, string][] = [
  ['all', '全部'], ['pending', '未完成'], ['completed', '已完成'], ['wrong', '有错题'], ['disabled', '未开启'],
];
const isPending = (row: DashboardRow) => ['inProgress', 'notStarted'].includes(row.status);
const accuracy = (correct: number, answered: number) => answered > 0 ? `${Math.round(correct / answered * 100)}%` : '--';

/** A read-only roster with safe Markdown reports; disposing invalidates every outstanding request. */
export function bindDailyQuizDashboard(root: HTMLElement, win = root.ownerDocument.defaultView) {
  const doc = root.ownerDocument;
  const lifetime = new win.AbortController();
  const details = new Map<number, DetailState>();
  const markdown = new MarkdownIt({ html: false, linkify: true });
  let data: QuizDashboard;
  let filter: RosterFilter = 'all';
  let query = '';
  let expanded: number | null = null;
  let visibleLimit = 30;
  let disposed = false;
  let scopeRequest: AbortController | null = null;
  let generation = 0;
  let failedScope: { day: string, classroom: string } | null = null;

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
  function field(text: string, node: HTMLElement) {
    const label = el('div', 'dqd-field');
    label.append(el('span', '', text), node);
    return label;
  }
  function safeUrl(value: string, sameOrigin = true) {
    try {
      const url = new win.URL(value, win.location.href);
      if (!['https:', 'http:'].includes(url.protocol) || (sameOrigin && url.origin !== win.location.origin)) return '';
      return url.href;
    } catch {
      return '';
    }
  }
  function settingsLink(row: DashboardRow, text = '问答设置') {
    const link = el('a', 'dqd-link', text);
    link.href = safeUrl(row.settingsUrl) || '#';
    return link;
  }
  function verificationLink() {
    const link = el('a', 'dqd-link', '在新窗口验证身份');
    link.href = safeUrl(win.location.href);
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }
  function content(value: string) {
    const node = el('div', 'typo dqd-markdown');
    node.innerHTML = markdown.render(value || '');
    return node;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    lifetime.abort();
    scopeRequest?.abort();
    details.forEach((state) => state.controller?.abort());
    details.clear();
  }

  try {
    data = JSON.parse(root.dataset.initial || '{}');
    if (!data.day || !data.today || !Array.isArray(data.rows) || !data.stats || !Array.isArray(data.domains)) throw new Error();
  } catch {
    root.replaceChildren(el('h1', '', '每日问答'), el('p', 'dqd-notice is-error', '概览暂时无法载入，请刷新页面重试。'));
    return { dispose };
  }

  root.replaceChildren();
  const header = el('header', 'dqd-header');
  const heading = el('div');
  const title = el('h1', '', '每日问答');
  title.dataset.heading = '';
  heading.append(el('p', 'dqd-eyebrow', '学员学习概览'), title, el('p', 'dqd-subtitle', '看进度、找错题，在这里了解每位学员的作答情况。'));
  const refresh = button('刷新数据', 'refresh', 'dqd-button dqd-button--quiet');
  header.append(heading, refresh);

  const controls = el('div', 'dqd-controls');
  const dateGroup = el('div', 'dqd-date-group');
  const previous = button('‹', 'previous');
  previous.setAttribute('aria-label', '查看前一天');
  const next = button('›', 'next');
  next.setAttribute('aria-label', '查看后一天');
  const date = el('input');
  date.type = 'date';
  date.dataset.quizDay = '';
  date.setAttribute('aria-label', '问答日期');
  dateGroup.append(previous, date, next, button('今天', 'today', 'dqd-button dqd-button--today'));
  const classroom = el('select');
  classroom.dataset.quizClassroom = '';
  classroom.setAttribute('aria-label', '筛选课堂');
  controls.append(field('问答日期', dateGroup), field('查看课堂', classroom), el('span', 'dqd-timezone', '日期与时间均为北京时间'));
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
  const rosterTitle = el('h2', '', '学员作答情况');
  rosterTitle.id = 'daily-quiz-roster-heading';
  rosterHeading.append(rosterTitle, el('p', '', '优先展示未完成学员与有错题的记录；点击详情即可原位查看。'));
  const search = el('input', 'dqd-search');
  search.type = 'search';
  search.placeholder = '搜索姓名、用户名或 UID';
  search.dataset.quizSearch = '';
  search.setAttribute('aria-label', '搜索学员姓名、用户名或 UID');
  rosterHeader.append(rosterHeading, search);
  const tabs = el('div', 'dqd-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '筛选学员作答状态');
  const tableWrap = el('div', 'dqd-table-wrap');
  const table = el('table', 'dqd-table');
  table.setAttribute('aria-labelledby', rosterTitle.id);
  const tableHead = el('thead');
  const headRow = el('tr');
  ['学员', '状态 / 进度', '答对 / 答错', '正确率', '积分', '详情'].forEach((text) => {
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
  const scopeNote = el('span', 'dqd-scope-note');
  const showMore = button('再显示 30 名学员', 'show-more', 'dqd-button dqd-button--small');
  showMore.hidden = true;
  rosterFooter.append(rowCount, showMore, scopeNote);
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
    date.value = data.day;
    date.max = data.today;
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
    next.disabled = data.day >= data.today;
  }
  function renderMetrics() {
    metrics.replaceChildren();
    const stats = data.stats;
    const entries = [
      ['已完成', `${stats.completed}`, `/ ${stats.assigned} 人`, `${stats.completed + stats.inProgress} 人已参与`, 'teal'],
      ['待完成', `${stats.inProgress + stats.notStarted}`, '人', `${stats.inProgress} 人进行中 · ${stats.notStarted} 人未开始`, 'blue'],
      ['答题正确率', accuracy(stats.correctCount, stats.answered), '', `答对 ${stats.correctCount} / 已答 ${stats.answered} 题`, 'teal'],
      ['错题总数', `${stats.wrongCount}`, '题', `本日累计获得 ${stats.earnedPoints} 积分`, 'amber'],
    ];
    entries.forEach(([label, value, unit, note, tone]) => {
      const card = el('div', `dqd-metric dqd-metric--${tone}`);
      const number = el('div', 'dqd-metric-value');
      number.append(el('strong', '', value), el('span', '', unit));
      card.append(el('p', 'dqd-metric-label', label), number, el('p', 'dqd-metric-note', note));
      metrics.append(card);
    });
    scopeNote.textContent = `汇总按日期与课堂统计，搜索和状态筛选不改变汇总${stats.noQuestions ? ` · ${stats.noQuestions} 人暂无可答题` : ''}${stats.unrecorded ? ` · ${stats.unrecorded} 人当日无记录` : ''}`;
  }
  function matches(row: DashboardRow, value: RosterFilter) {
    return value === 'all'
      || (value === 'pending' && isPending(row))
      || (value === 'completed' && row.status === 'completed')
      || (value === 'wrong' && row.wrongCount > 0)
      || (value === 'disabled' && row.status === 'disabled');
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
  function rank(row: DashboardRow) {
    if (row.status === 'inProgress') return 0;
    if (row.status === 'notStarted') return 1;
    if (row.wrongCount > 0) return 2;
    return { noQuestions: 3, completed: 4, disabled: 5, unrecorded: 6 }[row.status] ?? 7;
  }
  function formatTime(value: string) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(parsed);
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
      .sort((a, b) => rank(a) - rank(b) || b.wrongCount - a.wrongCount || a.name.localeCompare(b.name, 'zh-CN'));
    const rows = matchingRows.slice(0, visibleLimit);
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
      const progress = cell('状态 / 进度', 'dqd-progress-cell');
      const progressLabel = el('div', 'dqd-progress-label');
      progressLabel.append(el('span', `dqd-status is-${row.status}`, statusLabels[row.status] || '无记录'));
      if (row.total > 0) progressLabel.append(el('span', 'dqd-progress-numbers', `${row.answered} / ${row.total} 题`));
      progress.append(progressLabel);
      if (row.total > 0) {
        const bar = el('div', 'dqd-progress-track');
        bar.setAttribute('aria-hidden', 'true');
        const fill = el('span');
        fill.style.width = `${Math.min(100, Math.max(0, row.answered / row.total * 100))}%`;
        bar.append(fill);
        progress.append(bar);
      }
      if (row.lastAnsweredAt) progress.append(el('small', 'dqd-last-time', `最近 ${formatTime(row.lastAnsweredAt)}`));
      const outcomes = cell('答对 / 答错', 'dqd-outcomes');
      if (row.answered > 0) outcomes.append(el('span', 'dqd-correct', `${row.correctCount}`), el('span', 'dqd-divider', '/'), el('span', row.wrongCount ? 'dqd-wrong' : '', `${row.wrongCount}`));
      else outcomes.textContent = '--';
      const rate = cell('正确率', 'dqd-number');
      rate.textContent = accuracy(row.correctCount, row.answered);
      const points = cell('积分', 'dqd-number');
      points.textContent = `${row.earnedPoints}`;
      const action = cell('详情', 'dqd-action-cell');
      const toggle = button(expanded === row.uid ? '收起 ↑' : '查看详情 ↓', 'detail', 'dqd-detail-toggle');
      toggle.dataset.quizUid = `${row.uid}`;
      toggle.setAttribute('aria-expanded', `${expanded === row.uid}`);
      toggle.setAttribute('aria-controls', `daily-quiz-detail-${row.uid}`);
      toggle.setAttribute('aria-label', `${expanded === row.uid ? '收起' : '查看'}${row.name || row.uname}的问答详情`);
      toggle.disabled = !!scopeRequest;
      action.append(toggle);
      tr.append(student, progress, outcomes, rate, points, action);
      tableBody.append(tr);
      if (expanded === row.uid) {
        const detailRow = el('tr', 'dqd-detail-row');
        const detailCell = el('td');
        detailCell.colSpan = 6;
        const panel = el('div', 'dqd-detail-panel');
        panel.id = `daily-quiz-detail-${row.uid}`;
        panel.dataset.quizDetailPanel = `${row.uid}`;
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', `${row.name || row.uname}的问答详情`);
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
      empty.replaceChildren(
        el('strong', '', data.rows.length ? '没有符合条件的学员' : '这个范围暂无学员'),
        el('p', '', data.rows.length ? '试试其他状态，或调整搜索内容。' : '选择其他课堂，或先在学员管理中添加学员。'),
      );
      if (data.rows.length) empty.append(button('清除筛选', 'clear', 'dqd-button dqd-button--small'));
    }
  }

  function renderDetail(row: DashboardRow, panel: HTMLElement) {
    panel.replaceChildren();
    const state = details.get(row.uid);
    const detailHeader = el('div', 'dqd-detail-header');
    detailHeader.append(el('h3', '', `${row.name || row.uname} · ${data.day} 答题记录`), settingsLink(row));
    panel.append(detailHeader);
    panel.setAttribute('aria-busy', `${!state || state.status === 'loading'}`);
    if (!state || state.status === 'loading') {
      const loading = el('p', 'dqd-detail-message', '正在读取题目与作答记录…');
      loading.setAttribute('role', 'status');
      panel.append(loading);
      return;
    }
    if (state.status === 'error') {
      const error = el('div', 'dqd-detail-message is-error');
      error.setAttribute('role', 'alert');
      const retry = button('重试', 'retry-detail', 'dqd-button dqd-button--small');
      retry.dataset.quizUid = `${row.uid}`;
      error.append(el('span', '', state.error), retry);
      if (state.error.includes('身份验证')) error.append(verificationLink());
      panel.append(error);
      return;
    }
    const { report } = state;
    const summary = el('p', 'dqd-detail-summary', `已答 ${report.answered} / ${report.total} 题 · 答对 ${report.correctCount} 题 · 答错 ${report.wrongCount} 题 · 获得 ${report.earnedPoints} 积分`);
    panel.append(summary);
    if (!report.items.length) {
      const messages: Partial<Record<QuizStatus, string>> = {
        disabled: '这位学员尚未开启每日问答，可通过右上角的问答设置开启。',
        noQuestions: '当日暂无可答题，可能已掌握、处于复习间隔，或当前范围没有可用素材。可在问答设置中查看出题范围。',
        notStarted: '这位学员尚未开始当天问答，开始作答后可在这里查看题目和结果。',
        unrecorded: '这一天没有问答记录，无法据此判断学员是否完成。',
      };
      panel.append(el('p', 'dqd-detail-message', messages[row.status] || '当日暂无题目记录。'));
      return;
    }
    const filters = el('div', 'dqd-answer-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '筛选答题记录');
    [['all', '全部题目', report.total], ['wrong', '只看错题', report.wrongCount]].forEach(([key, label, count]) => {
      const control = button(`${label} ${count}`, 'answer-filter', 'dqd-answer-filter');
      control.dataset.quizAnswerFilter = `${key}`;
      control.dataset.quizUid = `${row.uid}`;
      control.setAttribute('aria-pressed', `${state.filter === key}`);
      filters.append(control);
    });
    panel.append(filters);
    const items = report.items.filter((item) => state.filter === 'all' || item.correct === false);
    items.forEach((item) => {
      const question = el('details', 'dqd-question');
      question.dataset.quizQuestion = item.id;
      question.open = item.correct === false;
      const questionHeading = el('summary');
      const questionStatus = item.correct == null ? '未作答' : item.correct ? '答对' : '答错';
      questionHeading.append(
        el('span', `dqd-answer-status ${item.correct == null ? 'is-unanswered' : item.correct ? 'is-correct' : 'is-wrong'}`, questionStatus),
        el('strong', '', `${item.index}. ${item.title}`),
        el('small', '', `${item.earnedPoints || 0} / ${item.points} 积分`),
      );
      const body = el('div', 'dqd-question-body');
      const kind = { single: '单选题', multiple: '多选题', judge: '判断题' }[item.kind] || item.kind;
      const metadata = [item.domainName, kind, ...(item.tags || [])];
      if (item.answeredAt) metadata.push(`作答于 ${formatTime(item.answeredAt)}（北京时间）`);
      body.append(el('p', 'dqd-question-meta', metadata.filter(Boolean).join(' · ')), content(item.stem));
      (item.options || []).forEach((option, index) => {
        const letter = String.fromCharCode(65 + index);
        const correct = (item.answers || []).includes(letter);
        const selected = (item.selected || []).includes(letter);
        const optionRow = el('div', `dqd-option${correct ? ' is-answer' : ''}${selected ? ' is-selected' : ''}`);
        optionRow.append(el('strong', 'dqd-option-letter', letter), content(option));
        const labels = el('span', 'dqd-option-labels');
        if (correct) labels.append(el('small', 'dqd-correct', '正确选项'));
        if (selected) labels.append(el('small', selected && !correct ? 'dqd-wrong' : '', '学员选择'));
        if (labels.childNodes.length) optionRow.append(labels);
        body.append(optionRow);
      });
      const answerText = (answers: string[]) => answers.map((answer) => (item.kind === 'judge' ? { A: '正确', B: '错误' }[answer] || answer : answer)).join('、');
      const answers = el('div', 'dqd-answers');
      answers.append(
        el('span', '', `学员答案：${item.selected?.length ? answerText(item.selected) : '未作答'}`),
        el('span', 'dqd-correct', `正确答案：${answerText(item.answers || [])}`),
      );
      body.append(answers);
      if (item.analysis) {
        const analysis = el('div', 'dqd-analysis');
        analysis.append(el('h4', '', '题目解析'), content(item.analysis));
        body.append(analysis);
      }
      question.append(questionHeading, body);
      panel.append(question);
    });
    if (!items.length) panel.append(el('p', 'dqd-detail-message', '这份记录中没有错题。'));
  }
  function updateDetail(row: DashboardRow) {
    const panel = root.querySelector<HTMLElement>(`[data-quiz-detail-panel="${row.uid}"]`);
    if (panel) renderDetail(row, panel);
  }
  async function readJson(url: string, signal: AbortSignal) {
    const response = await win.fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? '身份验证可能已过期，请在另一个窗口完成验证后重试。' : '暂时无法读取数据，请稍后重试。');
    try {
      return await response.json();
    } catch {
      throw new Error('未能读取数据，请完成身份验证后重试。');
    }
  }
  async function loadDetail(row: DashboardRow) {
    if (disposed || scopeRequest) return;
    details.get(row.uid)?.controller?.abort();
    const controller = new win.AbortController();
    const version = generation;
    const state: DetailState = { status: 'loading', filter: row.wrongCount ? 'wrong' : 'all', controller };
    details.set(row.uid, state);
    updateDetail(row);
    try {
      const url = safeUrl(row.detailUrl);
      if (!url) throw new Error('这份记录暂时无法读取，请刷新概览后重试。');
      const result = await readJson(url, controller.signal);
      if (!result.report || !Array.isArray(result.report.items)) throw new Error('这份记录暂时无法读取，请稍后重试。');
      if (disposed || version !== generation || controller.signal.aborted || details.get(row.uid) !== state) return;
      state.status = 'loaded';
      state.report = result.report;
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
  async function loadScope(day: string, selectedClassroom: string) {
    if (disposed) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > data.today || !Number.isFinite(Date.parse(`${day}T00:00:00Z`))) {
      showFeedback('请选择有效日期，最晚可查看今天。', true);
      syncScopeControls();
      return;
    }
    scopeRequest?.abort();
    const controller = new win.AbortController();
    scopeRequest = controller;
    generation += 1;
    details.forEach((state) => state.controller?.abort());
    showFeedback('正在载入所选日期与课堂的记录…');
    roster.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    root.querySelectorAll<HTMLButtonElement>('[data-quiz-action="detail"]').forEach((control) => { control.disabled = true; });
    const url = new win.URL(win.location.href);
    url.searchParams.set('day', day);
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
      failedScope = { day, classroom: selectedClassroom };
      // Keep the previous complete snapshot visible and make the failed selection retryable.
      details.forEach((state, uid) => { if (state.status === 'loading') details.delete(uid); });
      expanded = null;
      syncScopeControls();
      showFeedback(`${error instanceof Error ? error.message : '读取失败，请重试。'} 当前仍显示 ${data.day} 的数据。`, true, true);
    } finally {
      if (!disposed && scopeRequest === controller) {
        scopeRequest = null;
        roster.removeAttribute('aria-busy');
        refresh.disabled = false;
        renderRows();
      }
    }
  }
  function shiftDay(offset: number) {
    const value = new Date(`${date.value || data.day}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  }
  function onClick(event: Event) {
    const target = event.target as HTMLElement;
    const control = target.closest<HTMLButtonElement>('[data-quiz-action]');
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.quizAction;
    if (action === 'previous' || action === 'next') {
      const day = shiftDay(action === 'previous' ? -1 : 1);
      date.value = day;
      loadScope(day, classroom.value);
    } else if (action === 'today') {
      date.value = data.today;
      loadScope(data.today, classroom.value);
    } else if (action === 'refresh') loadScope(data.day, data.classroom);
    else if (action === 'retry-scope' && failedScope) loadScope(failedScope.day, failedScope.classroom);
    else if (action === 'show-more') {
      visibleLimit += 30;
      renderRows();
    } else if (action === 'filter' || action === 'clear') {
      filter = action === 'clear' ? 'all' : control.dataset.quizFilter as RosterFilter;
      visibleLimit = 30;
      if (action === 'clear') { query = ''; search.value = ''; }
      renderTabs();
      renderRows();
      tabs.querySelector<HTMLButtonElement>(`[data-quiz-filter="${filter}"]`)?.focus();
    } else if (action === 'detail' || action === 'retry-detail' || action === 'answer-filter') {
      const uid = Number(control.dataset.quizUid);
      const row = data.rows.find((item) => item.uid === uid);
      if (!row) return;
      if (action === 'detail') {
        expanded = expanded === uid ? null : uid;
        renderRows();
        root.querySelector<HTMLButtonElement>(`[data-quiz-action="detail"][data-quiz-uid="${uid}"]`)?.focus();
        if (expanded === uid && !details.has(uid)) loadDetail(row);
      } else if (action === 'retry-detail') loadDetail(row);
      else {
        const state = details.get(uid);
        if (!state) return;
        state.filter = control.dataset.quizAnswerFilter === 'wrong' ? 'wrong' : 'all';
        updateDetail(row);
        root.querySelector<HTMLButtonElement>(`[data-quiz-answer-filter="${state.filter}"][data-quiz-uid="${uid}"]`)?.focus();
      }
    }
  }
  root.addEventListener('click', onClick, { signal: lifetime.signal });
  search.addEventListener('input', () => { query = search.value; visibleLimit = 30; renderRows(); }, { signal: lifetime.signal });
  date.addEventListener('change', () => { loadScope(date.value, classroom.value); }, { signal: lifetime.signal });
  classroom.addEventListener('change', () => { loadScope(date.value, classroom.value); }, { signal: lifetime.signal });
  win.addEventListener('pagehide', (event) => {
    // Persisted pages keep their live DOM and listeners when restored from the back/forward cache.
    if (!event.persisted) dispose();
  }, { signal: lifetime.signal });
  syncScopeControls();
  renderMetrics();
  renderTabs();
  renderRows();
  return { dispose };
}
