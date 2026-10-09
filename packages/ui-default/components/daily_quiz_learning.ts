import MarkdownIt from 'markdown-it';
import Katex from '../backendlib/markdown-it-katex';

export interface LearningSummary {
  total: number;
  answered: number;
  correctCount: number;
  wrongCount: number;
  unseenCount: number;
  accuracy: number | null;
  participationCount: number;
  earnedPoints: number;
}
export interface LearningQuestion {
  id: string;
  sourceId?: string;
  index: number;
  domainId?: string;
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
export interface LearningSession {
  id: string;
  round: number;
  day: string;
  total: number;
  answered: number;
  correctCount: number;
  wrongCount: number;
  earnedPoints: number;
  completed: boolean;
  detailUrl: string;
}
export interface QuizLearning {
  summary: LearningSummary;
  tags: { domainId: string, domainName: string, name: string, total: number, answered: number, correctCount: number, wrongCount: number, accuracy: number | null }[];
  questions: LearningQuestion[];
  sessions: LearningSession[];
  upcomingUrl?: string;
}
interface UpcomingQuestion extends LearningQuestion {
  current: boolean;
  awaitingAcknowledgement: boolean;
}
interface UpcomingQuiz {
  status: 'ready' | 'continue' | 'completed' | 'empty' | 'disabled';
  day: string;
  checkedAt?: string;
  requested: number;
  total: number;
  remaining: number;
  currentQuestionId?: number | null;
  projected: boolean;
  items: UpcomingQuestion[];
  next?: UpcomingQuiz;
}
type View = 'review' | 'answered' | 'tags' | 'sessions' | 'upcoming';
interface SessionState {
  status: 'loading' | 'loaded' | 'error';
  items?: LearningQuestion[];
  error?: string;
  controller?: AbortController;
}
interface UpcomingState {
  status: 'loading' | 'loaded' | 'error';
  preview?: UpcomingQuiz;
  checkedAt?: string;
  error?: string;
  controller?: AbortController;
}

export const learningAccuracy = (correct: number, answered: number) => answered > 0 ? `${Math.round(correct / answered * 100)}%` : '--';

/** Shared by the teacher overview and the student's management panel. */
export function bindDailyQuizLearning(host: HTMLElement, learning: QuizLearning) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const lifetime = new win.AbortController();
  const markdown = new MarkdownIt({ html: false, linkify: true }).use(Katex);
  const sessions = new Map<string, SessionState>();
  const participatedSessions = learning.sessions.filter((session) => session.answered > 0);
  const sessionOrdinals = new Map([...participatedSessions]
    .sort((a, b) => a.day.localeCompare(b.day) || a.round - b.round || a.id.localeCompare(b.id))
    .map((session, index) => [session.id, index + 1] as const));
  let view: View = 'review';
  let selectedTag: QuizLearning['tags'][number] | null = null;
  let limit = 20;
  let expandedSession: string | null = null;
  let upcoming: UpcomingState | null = null;
  let disposed = false;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(text: string, action: string, className = 'dql-button') {
    const node = el('button', className, text);
    node.type = 'button';
    node.dataset.learningAction = action;
    return node;
  }
  function content(value: string) {
    const node = el('div', 'typo dql-markdown');
    node.innerHTML = markdown.render(value || '');
    return node;
  }
  function time(value: string) {
    const parsed = new Date(value);
    return Number.isFinite(+parsed) ? new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(parsed) : '';
  }
  function question(item: LearningQuestion, index: number, historical = false) {
    const node = el('details', 'dql-question');
    node.dataset.learningQuestion = item.sourceId || item.id;
    const summary = el('summary');
    const name = el('div', 'dql-question-name');
    name.append(el('strong', '', item.title || `第 ${index + 1} 题`));
    const kind = { single: '单选', multiple: '多选', judge: '判断' }[item.kind] || item.kind;
    name.append(el('small', '', [item.domainName, kind, ...(item.tags || [])].filter(Boolean).join(' · ')));
    const status = item.correct == null ? '未作答' : item.correct ? '答对' : historical ? '答错' : '待复习';
    summary.append(el('span', `dql-result ${item.correct == null ? 'is-unanswered' : item.correct ? 'is-correct' : 'is-wrong'}`, status), name);
    const body = el('div', 'dql-question-body');
    if (item.answeredAt) body.append(el('p', 'dql-question-time', `${historical ? '作答' : '最近作答'} ${time(item.answeredAt)} · 北京时间`));
    body.append(content(item.stem));
    (item.options || []).forEach((option, optionIndex) => {
      const letter = String.fromCharCode(65 + optionIndex);
      const correct = (item.answers || []).includes(letter);
      const selected = (item.selected || []).includes(letter);
      const row = el('div', `dql-option${correct ? ' is-answer' : ''}${selected ? ' is-selected' : ''}`);
      row.append(el('strong', 'dql-option-letter', letter), content(option));
      const labels = el('span', 'dql-option-labels');
      if (correct) labels.append(el('small', 'dql-correct', '正确选项'));
      if (selected) labels.append(el('small', !correct ? 'dql-wrong' : '', '学员选择'));
      if (labels.childNodes.length) row.append(labels);
      body.append(row);
    });
    const answerText = (answers: string[]) => answers.map((answer) => (item.kind === 'judge' ? { A: '正确', B: '错误' }[answer] || answer : answer)).join('、');
    const answers = el('div', 'dql-answers');
    answers.append(el('span', '', `学员答案：${item.selected?.length ? answerText(item.selected) : '未作答'}`), el('span', 'dql-correct', `正确答案：${answerText(item.answers || [])}`));
    body.append(answers);
    if (item.analysis) {
      const analysis = el('div', 'dql-analysis');
      analysis.append(el('h4', '', '题目解析'), content(item.analysis));
      body.append(analysis);
    }
    node.append(summary, body);
    return node;
  }
  function message(title: string, detail: string) {
    const node = el('div', 'dql-empty');
    node.append(el('strong', '', title), el('p', '', detail));
    return node;
  }
  function upcomingQuestion(item: UpcomingQuestion, index: number) {
    const node = el('details', 'dql-question dql-upcoming-question');
    node.dataset.learningUpcomingQuestion = item.sourceId || item.id;
    const summary = el('summary');
    const name = el('div', 'dql-question-name');
    const kind = { single: '单选', multiple: '多选', judge: '判断' }[item.kind] || item.kind;
    const status = item.awaitingAcknowledgement ? item.correct === false && item.analysis ? '待确认解析' : '待继续'
      : item.current ? '首先看到' : `第 ${item.index || index + 1} 题`;
    name.append(el('strong', '', item.title || `第 ${index + 1} 题`));
    name.append(el('small', '', [item.domainName, kind, item.points > 0 ? `答对 +${item.points} 积分` : '不计积分'].filter(Boolean).join(' · ')));
    summary.append(el('span', `dql-result ${item.awaitingAcknowledgement ? 'is-wrong' : 'is-upcoming'}`, status), name);
    const body = el('div', 'dql-question-body');
    if (item.awaitingAcknowledgement) {
      body.append(el('p', 'dql-upcoming-feedback', item.correct === false && item.analysis
        ? '这道题已作答，学员确认题解后会继续下一题。' : '这道题已作答，学员点击继续后进入下一题。'));
    }
    body.append(content(item.stem));
    (item.options || []).forEach((option, optionIndex) => {
      const row = el('div', 'dql-option');
      row.append(el('strong', 'dql-option-letter', String.fromCharCode(65 + optionIndex)), content(option));
      body.append(row);
    });
    const solution = el('details', 'dql-upcoming-solution');
    solution.append(el('summary', '', '展开答案与解析'));
    const answerText = (answers: string[]) => answers.map((answer) => (item.kind === 'judge' ? { A: '正确', B: '错误' }[answer] || answer : answer)).join('、');
    const answers = el('div', 'dql-answers');
    answers.append(el('span', 'dql-correct', `正确答案：${answerText(item.answers || [])}`));
    if (item.awaitingAcknowledgement && item.selected?.length) answers.append(el('span', '', `学员答案：${answerText(item.selected)}`));
    solution.append(answers);
    if (item.analysis) {
      const analysis = el('div', 'dql-analysis');
      analysis.append(el('h4', '', '题目解析'), content(item.analysis));
      solution.append(analysis);
    }
    body.append(solution);
    node.append(summary, body);
    return node;
  }
  function verificationLink() {
    const link = el('a', 'dql-link', '在新窗口验证身份');
    link.href = win.location.href;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }
  host.replaceChildren();
  host.classList.add('daily-quiz-learning');
  const summary = el('div', 'dql-overview');
  const { summary: stats } = learning;
  const summaryEntries = [
    ['已答 / 当前题目', `${stats.answered} / ${stats.total}`], ['最近答对', `${stats.correctCount}`],
    ['答错待复习', `${stats.wrongCount}`], ['正确率', learningAccuracy(stats.correctCount, stats.answered)],
    ['参与练习', `${stats.participationCount} 次`],
  ];
  summaryEntries.forEach(([label, value]) => {
    const item = el('div');
    item.append(el('span', '', label), el('strong', '', value));
    summary.append(item);
  });
  const note = el('p', 'dql-scope-note', '仅统计当前指定知识点范围；同一题多次作答只计一次，以最近结果为准。未答题不计入正确率。');
  const tabs = el('div', 'dql-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '知识掌握详情');
  const panel = el('div', 'dql-panel');
  panel.dataset.learningPanel = '';
  host.append(summary, note, tabs, panel);

  function renderTabs() {
    tabs.replaceChildren();
    const entries: [View, string, number?][] = [
      ['review', '待复习', stats.wrongCount], ['answered', '全部已答', stats.answered],
      ['tags', '知识点', learning.tags.length], ['sessions', '练习记录', participatedSessions.length],
    ];
    if (learning.upcomingUrl) entries.unshift(['upcoming', '即将练习']);
    entries.forEach(([key, label, count]) => {
      const tab = button(label, 'view', 'dql-tab');
      tab.dataset.learningView = key;
      tab.setAttribute('aria-pressed', `${view === key}`);
      if (count != null) tab.append(el('span', '', `${count}`));
      tabs.append(tab);
    });
  }
  function renderUpcoming() {
    const node = el('div', 'dql-upcoming');
    node.dataset.learningUpcomingPanel = '';
    node.setAttribute('aria-busy', `${!upcoming || upcoming.status === 'loading'}`);
    panel.append(node);
    if (!upcoming || upcoming.status === 'loading') {
      const loading = el('p', 'dql-loading', '正在查看学员下一次会看到的题目…');
      loading.setAttribute('role', 'status');
      node.append(loading);
      return;
    }
    if (upcoming.status === 'error') {
      const error = el('div', 'dql-error');
      error.setAttribute('role', 'alert');
      error.append(el('span', '', upcoming.error), button('重试', 'retry-upcoming'));
      if (upcoming.error.includes('身份验证')) error.append(verificationLink());
      node.append(error);
      return;
    }
    const preview = upcoming.preview;
    const next = preview.next;
    const quiz = next || preview;
    const header = el('div', 'dql-upcoming-header');
    const heading = el('div');
    let title = '登录后将看到这些题';
    let description = '按当前设置预览，查看不会开始练习或改变学员进度。';
    if (preview.status === 'disabled') {
      title = '每日问答尚未开启';
      description = '开启后，学员登录平台时才会看到每日问答。';
    } else if (preview.status === 'continue') {
      title = '登录后继续这次练习';
      description = '从当前进度继续，下方按学员将看到的顺序排列。';
    } else if (preview.status === 'completed') {
      title = '今天已完成，登录不会再次出现';
      description = next ? '下方预览下一次练习的题目。' : '下一次练习开放后，学员会看到新一轮题目。';
    } else if (preview.status === 'empty') {
      title = '今天暂无可出题目';
      description = next ? '下方预览下一次练习的可用题目。' : '当前范围的题目可能已答对，或仍在错题复习间隔内。';
    }
    heading.append(el('strong', '', title), el('p', '', description));
    header.append(heading, button('刷新预览', 'refresh-upcoming'));
    node.append(header);
    if (preview.status !== 'disabled') {
      if (next) node.append(el('h4', 'dql-upcoming-next', `下一次练习预览 · ${next.day}`));
      if (quiz.items.length) {
        const metrics = el('div', 'dql-upcoming-metrics');
        metrics.append(el('span', '', `${quiz.items.length} 道${preview.status === 'continue' ? '待继续' : '待练习'}`));
        const points = quiz.items.filter((item) => !item.awaitingAcknowledgement).reduce((sum, item) => sum + item.points, 0);
        metrics.append(el('span', '', `答对最多可得 ${points} 积分`));
        const domains = [...new Set(quiz.items.map((item) => item.domainName).filter(Boolean))];
        if (domains.length) metrics.append(el('span', 'dql-upcoming-domains', domains.join(' / ')));
        node.append(metrics);
        if (quiz.items.length < quiz.remaining) node.append(el('p', 'dql-history-note', `仅显示本课堂 ${quiz.items.length} 题 / 全部剩余 ${quiz.remaining} 题。`));
        if (quiz.projected && quiz.total < quiz.requested) {
          node.append(el('p', 'dql-upcoming-shortage', `设置 ${quiz.requested} 题，本次可出 ${quiz.total} 题；已答对或尚未到复习间隔的题目不会重复安排。`));
        }
        quiz.items.forEach((item, index) => node.append(upcomingQuestion(item, index)));
      } else if (quiz.remaining > 0) {
        node.append(message('当前课堂没有即将出现的题目', '学员仍有其他课堂的题目待完成，可切换为全部课堂查看。'));
        node.append(el('p', 'dql-history-note', `仅显示本课堂 0 题 / 全部剩余 ${quiz.remaining} 题。`));
      } else if (preview.status !== 'completed' || next) {
        node.append(message('暂时没有可安排的题目', '可查看问答设置与素材范围；新增符合条件的题目，或错题达到复习间隔后，再刷新预览。'));
      }
    }
    const checked = time(preview.checkedAt || upcoming.checkedAt);
    const freshness = `${checked ? `更新于 ${checked} · 北京时间。` : ''}${preview.status === 'disabled'
      ? '调整问答设置后，请刷新预览。' : quiz.projected
      ? '这是按当前设置生成的预计题目；调整设置、题库或学员进度后，请刷新预览。' : '显示学员当前进度；学员继续作答后，请刷新预览。'}`;
    node.append(el('p', 'dql-history-note dql-upcoming-freshness', freshness));
  }
  function renderSession(session: LearningSession, node: HTMLElement) {
    node.replaceChildren();
    const state = sessions.get(session.id);
    node.setAttribute('aria-busy', `${!state || state.status === 'loading'}`);
    if (!state || state.status === 'loading') {
      const loading = el('p', 'dql-loading', '正在读取这次练习的作答记录…');
      loading.setAttribute('role', 'status');
      node.append(loading);
    } else if (state.status === 'error') {
      const error = el('div', 'dql-error');
      error.setAttribute('role', 'alert');
      const retry = button('重试', 'retry-session');
      retry.dataset.learningSession = session.id;
      error.append(el('span', '', state.error), retry);
      if (state.error.includes('身份验证')) error.append(verificationLink());
      node.append(error);
    } else if (!state.items.length) node.append(message('这次练习没有题目记录', '可查看其他练习或回到当前知识掌握。'));
    else {
      node.append(el('p', 'dql-history-note', '这里保留本次作答结果；“待复习”和“全部已答”展示每道题的最近结果。'));
      state.items.forEach((item, index) => node.append(question(item, index, true)));
    }
  }
  function renderPanel() {
    panel.replaceChildren();
    if (view === 'upcoming') {
      renderUpcoming();
    } else if (view === 'review' || view === 'answered') {
      const all = learning.questions.filter((item) => (view === 'answered' || item.correct === false)
        && (!selectedTag || (item.domainId === selectedTag.domainId
          && (selectedTag.name === '未标注知识点' ? !item.tags?.length : item.tags?.includes(selectedTag.name)))));
      if (selectedTag) {
        const scope = el('div', 'dql-tag-filter');
        scope.append(el('span', '', `${selectedTag.domainName} · ${selectedTag.name} · 待复习 ${all.length} 题`), button('查看全部错题', 'clear-tag'));
        panel.append(scope);
      }
      if (!all.length) {
        panel.append(message(view === 'review' ? '当前没有待复习错题' : '当前范围还没有作答记录', view === 'review'
          ? stats.answered ? '最近作答的题目均已答对，可以查看知识点掌握情况或继续练习。' : '开始练习后，这里会整理需要巩固的题目。'
          : '学员作答后，将按题目汇总最近结果。'));
        return;
      }
      all.slice(0, limit).forEach((item, index) => panel.append(question(item, index)));
      if (all.length > limit) panel.append(button(`再显示 ${Math.min(20, all.length - limit)} 题`, 'more', 'dql-button dql-more'));
    } else if (view === 'tags') {
      if (!learning.tags.length) {
        panel.append(message('当前范围还没有知识点', '可在问答设置中选择课堂与知识点标签。'));
        return;
      }
      const grid = el('div', 'dql-tag-grid');
      learning.tags.forEach((tag, tagIndex) => {
        const card = el('section', 'dql-tag');
        const title = el('div', 'dql-tag-title');
        title.append(el('strong', '', tag.name), el('small', '', tag.domainName));
        const numbers = el('div', 'dql-tag-numbers');
        numbers.append(el('span', 'dql-correct', `答对 ${tag.correctCount}`), el('span', tag.wrongCount ? 'dql-wrong' : '', `待复习 ${tag.wrongCount}`), el('strong', '', learningAccuracy(tag.correctCount, tag.answered)));
        const progress = el('div', 'dql-tag-progress');
        progress.setAttribute('aria-hidden', 'true');
        const correct = el('span', 'is-correct');
        const wrong = el('span', 'is-wrong');
        correct.style.width = `${tag.total ? tag.correctCount / tag.total * 100 : 0}%`;
        wrong.style.width = `${tag.total ? tag.wrongCount / tag.total * 100 : 0}%`;
        progress.append(correct, wrong);
        card.append(title, numbers, progress, el('p', '', `已答 ${tag.answered} / ${tag.total} 题 · 未答 ${Math.max(0, tag.total - tag.answered)} 题`));
        if (tag.wrongCount > 0) {
          const review = button('查看这个知识点的错题 →', 'tag-review', 'dql-tag-review');
          review.dataset.learningTag = `${tagIndex}`;
          card.append(review);
        }
        grid.append(card);
      });
      panel.append(grid, el('p', 'dql-history-note', '同一题可属于多个知识点，各知识点题数不宜直接相加。'));
    } else {
      if (!participatedSessions.length) {
        panel.append(message('还没有参与练习', '产生作答后，这里会保留每次练习及当时的答案。'));
        return;
      }
      participatedSessions.forEach((session) => {
        const ordinal = sessionOrdinals.get(session.id);
        const card = el('section', 'dql-session');
        const header = el('div', 'dql-session-header');
        const description = el('div');
        description.append(el('strong', '', `第 ${ordinal} 次练习`), el('small', '', `${session.day} · 已答 ${session.answered} / ${session.total} 题`));
        const result = el('span', 'dql-session-result', `答对 ${session.correctCount} · 答错 ${session.wrongCount}`);
        const toggle = button(expandedSession === session.id ? '收起 ↑' : '查看作答 ↓', 'session', 'dql-session-toggle');
        toggle.dataset.learningSession = session.id;
        toggle.setAttribute('aria-expanded', `${expandedSession === session.id}`);
        toggle.setAttribute('aria-label', `${expandedSession === session.id ? '收起' : '查看'}第 ${ordinal} 次练习`);
        header.append(description, result, toggle);
        card.append(header);
        if (expandedSession === session.id) {
          const body = el('div', 'dql-session-body');
          body.dataset.learningSessionPanel = session.id;
          body.setAttribute('role', 'region');
          body.setAttribute('aria-label', `第 ${ordinal} 次练习的作答记录`);
          renderSession(session, body);
          card.append(body);
        }
        panel.append(card);
      });
    }
  }
  function updateSession(session: LearningSession) {
    const node = Array.from(panel.querySelectorAll<HTMLElement>('[data-learning-session-panel]'))
      .find((item) => item.dataset.learningSessionPanel === session.id);
    if (node) renderSession(session, node);
  }
  async function loadSession(session: LearningSession) {
    sessions.get(session.id)?.controller?.abort();
    const controller = new win.AbortController();
    const state: SessionState = { status: 'loading', controller };
    sessions.set(session.id, state);
    updateSession(session);
    try {
      const url = new win.URL(session.detailUrl, win.location.href);
      if (url.origin !== win.location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('记录地址无效，请刷新后重试。');
      const response = await win.fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '身份验证可能已过期，请验证后重试。' : '暂时无法读取这次练习，请重试。');
      let result;
      try { result = await response.json(); } catch { throw new Error('身份验证可能已过期，请验证后重试。'); }
      if (!Array.isArray(result.report?.items)) throw new Error('暂时无法读取这次练习，请重试。');
      if (disposed || controller.signal.aborted || sessions.get(session.id) !== state) return;
      state.status = 'loaded';
      state.items = result.report.items;
      state.controller = null;
      updateSession(session);
    } catch (error) {
      if (disposed || controller.signal.aborted || sessions.get(session.id) !== state) return;
      state.status = 'error';
      state.error = error instanceof Error ? error.message : '读取失败，请重试。';
      state.controller = null;
      updateSession(session);
    }
  }
  async function loadUpcoming() {
    if (!learning.upcomingUrl) return;
    upcoming?.controller?.abort();
    const controller = new win.AbortController();
    const state: UpcomingState = { status: 'loading', controller };
    upcoming = state;
    if (view === 'upcoming') renderPanel();
    try {
      const url = new win.URL(learning.upcomingUrl, win.location.href);
      if (url.origin !== win.location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('预览地址无效，请刷新后重试。');
      const response = await win.fetch(url.href, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '身份验证可能已过期，请验证后重试。' : '暂时无法读取即将练习的题目，请重试。');
      let result;
      try { result = await response.json(); } catch { throw new Error('身份验证可能已过期，请验证后重试。'); }
      const valid = (value: UpcomingQuiz) => value && ['ready', 'continue', 'completed', 'empty', 'disabled'].includes(value.status) && Array.isArray(value.items);
      if (!valid(result.upcoming) || (result.upcoming.next && !valid(result.upcoming.next))) throw new Error('暂时无法读取即将练习的题目，请重试。');
      if (disposed || controller.signal.aborted || upcoming !== state) return;
      state.status = 'loaded';
      state.preview = result.upcoming;
      state.checkedAt = new Date().toISOString();
      state.controller = null;
      if (view === 'upcoming') renderPanel();
    } catch (error) {
      if (disposed || controller.signal.aborted || upcoming !== state) return;
      state.status = 'error';
      state.error = error instanceof Error ? error.message : '读取失败，请重试。';
      state.controller = null;
      if (view === 'upcoming') renderPanel();
    }
  }
  host.addEventListener('click', (event) => {
    const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-learning-action]');
    if (!control || !host.contains(control)) return;
    const action = control.dataset.learningAction;
    if (action === 'view') {
      const previousView = view;
      view = control.dataset.learningView as View;
      selectedTag = null;
      limit = 20;
      renderTabs();
      renderPanel();
      tabs.querySelector<HTMLButtonElement>(`[data-learning-view="${view}"]`)?.focus();
      if (view === 'upcoming' && (!upcoming || (previousView !== 'upcoming' && upcoming.status !== 'loading'))) loadUpcoming();
    } else if (action === 'refresh-upcoming' || action === 'retry-upcoming') {
      loadUpcoming();
    } else if (action === 'tag-review' || action === 'clear-tag') {
      selectedTag = action === 'tag-review' ? learning.tags[Number(control.dataset.learningTag)] || null : null;
      view = 'review';
      limit = 20;
      renderTabs();
      renderPanel();
      tabs.querySelector<HTMLButtonElement>('[data-learning-view="review"]')?.focus();
    } else if (action === 'more') {
      limit += 20;
      renderPanel();
    } else if (action === 'session' || action === 'retry-session') {
      const session = participatedSessions.find((item) => item.id === control.dataset.learningSession);
      if (!session) return;
      if (action === 'session') {
        expandedSession = expandedSession === session.id ? null : session.id;
        renderPanel();
        Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-learning-action="session"]'))
          .find((item) => item.dataset.learningSession === session.id)?.focus();
        if (expandedSession === session.id && !sessions.has(session.id)) loadSession(session);
      } else loadSession(session);
    }
  }, { signal: lifetime.signal });
  renderTabs();
  renderPanel();
  return {
    dispose() {
      disposed = true;
      lifetime.abort();
      upcoming?.controller?.abort();
      sessions.forEach((state) => state.controller?.abort());
      sessions.clear();
    },
  };
}
