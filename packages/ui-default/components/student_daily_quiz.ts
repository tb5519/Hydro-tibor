import { bindDailyQuizLearning, type QuizLearning } from './daily_quiz_learning';

interface QuizDomainPolicy {
  domainId: string;
  enabled: boolean;
  count: number;
  tags: string[];
  points: number[];
}
interface QuizPolicy {
  version: number;
  enabled: boolean;
  cooldownRounds: number;
  domains: QuizDomainPolicy[];
}
interface QuizDomain {
  id: string;
  name: string;
  tags: { name: string, count: number }[];
  availableCount: number;
  questionTags: string[][];
  createUrl: string;
}
interface QuizData {
  policy?: QuizPolicy;
  domains?: QuizDomain[];
  learning?: QuizLearning;
}

/** Keep settings drafts independent from the current knowledge mastery view. */
export function bindStudentDailyQuiz(editor: HTMLElement, onSaved: (enabled: boolean) => void, onUrlChange: () => void = () => {}) {
  const doc = editor.ownerDocument;
  const win = doc.defaultView;
  const form = editor.querySelector<HTMLFormElement>('[data-student-daily-form]');
  if (!form) return { isDirty: () => false, isPending: () => false };
  const content = form.querySelector<HTMLElement>('[data-daily-content]');
  const feedback = form.querySelector<HTMLElement>('[data-daily-feedback]');
  const history = editor.querySelector<HTMLElement>('[data-daily-history]');
  let data: QuizData = {};
  try {
    data = JSON.parse(form.dataset.initial || '{}');
  } catch {
    /* The empty state stays usable. */
  }
  const domains = data.domains || [];
  const policy: QuizPolicy = {
    version: 1,
    enabled: !!data.policy?.enabled,
    cooldownRounds: data.policy?.cooldownRounds ?? 3,
    domains: domains.map((domain) => {
      const saved = data.policy?.domains?.find((item) => item.domainId === domain.id);
      return saved
        ? { ...saved, tags: [...saved.tags], points: [...saved.points] }
        : { domainId: domain.id, enabled: false, count: 5, tags: [], points: Array.from({ length: 5 }, () => 1) };
    }),
  };
  let baseline = JSON.stringify(policy);
  let pending = false;
  let learningRequest = 0;
  let learningController: AbortController | null = null;
  let learningView: ReturnType<typeof bindDailyQuizLearning> | null = null;
  let catalogRequest = 0;
  let catalogController: AbortController | null = null;
  const lifetime = new win.AbortController();
  const domainCatalogViews = new Map<string, () => void>();
  let subtab = new win.URL(win.location.href).searchParams.get('quizView') === 'settings' ? 'settings' : 'records';
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function message(text: string, error = false) {
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle('is-error', error);
  }
  function numberInput(value: number, min: number, max: number, label: string) {
    const input = el('input', 'textbox');
    input.type = 'number';
    input.min = `${min}`;
    input.max = `${max}`;
    input.step = '1';
    input.value = `${value}`;
    input.setAttribute('aria-label', label);
    return input;
  }
  function field(label: string, input: HTMLElement) {
    const wrapper = el('label', 'student-daily-field');
    wrapper.append(el('span', '', label), input);
    return wrapper;
  }
  function updateUrl(key: string, value: string) {
    const url = new win.URL(win.location.href);
    url.searchParams.set(key, value);
    url.searchParams.delete('quizDay');
    win.history.replaceState(null, '', url);
    onUrlChange();
  }
  const subtabs = el('nav', 'student-daily-subtabs');
  subtabs.setAttribute('aria-label', '每日问答');
  const recordsButton = el('button', '', '知识掌握');
  const settingsButton = el('button', '', '问答设置');
  [recordsButton, settingsButton].forEach((button) => {
    button.type = 'button';
    subtabs.append(button);
  });
  form.parentElement.append(subtabs, history, form);
  function selectSubtab(value: string) {
    subtab = value;
    form.hidden = value !== 'settings';
    history.hidden = value !== 'records';
    recordsButton.setAttribute('aria-pressed', `${value === 'records'}`);
    settingsButton.setAttribute('aria-pressed', `${value === 'settings'}`);
    updateUrl('quizView', value);
  }
  selectSubtab(subtab);

  const overview = el('div', 'student-daily-overview');
  const toggle = el('label', 'student-daily-toggle');
  const toggleCopy = el('span');
  toggleCopy.append(el('strong', '', '为这位学员开启每日问答'), el('small', '', '每天合并已开启课堂的题目，答完一轮即可进入学习。'));
  const enabled = el('input');
  enabled.type = 'checkbox';
  enabled.checked = policy.enabled;
  enabled.dataset.dailyEnabled = '';
  toggle.append(toggleCopy, enabled);
  const summary = el('div', 'student-daily-summary');
  summary.setAttribute('aria-live', 'polite');
  overview.append(toggle, summary);
  const global = el('div', 'student-daily-global');
  const cooldown = numberInput(policy.cooldownRounds, 1, 30, '题目间隔轮数');
  cooldown.dataset.dailyCooldown = '';
  global.append(field('错题复习间隔', cooldown), el('p', 'student-daily-help', '答对的题不再出现；答错的题隔几轮再复习，默认间隔 3 轮。'));
  const catalogTools = el('div', 'student-daily-catalog-tools');
  const catalogRefresh = el('button', 'student-daily-refresh', '刷新题目标签');
  catalogRefresh.type = 'button';
  catalogRefresh.dataset.dailyCatalogRefresh = '';
  const catalogStatus = el('p', 'student-daily-catalog-status', '题目标签会根据当前课堂的选择题、判断题素材更新。');
  catalogStatus.dataset.dailyCatalogStatus = '';
  catalogStatus.setAttribute('role', 'status');
  catalogTools.append(catalogRefresh, catalogStatus);
  content.replaceChildren(overview, global, catalogTools);
  const domainViews: { fieldset: HTMLFieldSetElement, checkbox: HTMLInputElement }[] = [];
  function updateSummary() {
    const active = policy.domains.filter((item) => item.enabled);
    const count = active.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0);
    const points = active.reduce(
      (sum, item) => sum + item.points.reduce((total, point) => total + (Number.isFinite(point) ? point : 0), 0),
      0,
    );
    summary.replaceChildren(
      el('strong', '', `${count} 道 / 天`),
      el('span', '', `来自 ${active.length} 个课堂`),
      el('strong', '', `最多 ${points} 积分`),
    );
    summary.classList.toggle('is-warning', count > 50 || active.length > 10);
    if (!policy.enabled) summary.append(el('span', '', '当前已关闭，设置会保留'));
    if (count > 50) summary.append(el('span', '', '每天最多 50 道，请减少题数'));
    cooldown.disabled = !policy.enabled;
    domainViews.forEach((view, index) => {
      view.checkbox.disabled = !policy.enabled;
      view.fieldset.disabled = !policy.enabled || !policy.domains[index].enabled;
    });
  }
  enabled.addEventListener('change', () => {
    policy.enabled = enabled.checked;
    updateSummary();
  });
  cooldown.addEventListener('input', () => {
    policy.cooldownRounds = cooldown.valueAsNumber;
  });
  if (!domains.length) content.append(el('p', 'student-daily-help', '先在基本资料中为学员加入课堂，再配置每日问答。'));
  domains.forEach((domain, index) => {
    const entry = policy.domains[index];
    const card = el('details', 'student-daily-domain');
    card.open = entry.enabled;
    const heading = el('summary');
    const availableLabel = el('span', 'student-daily-help', `${domain.availableCount} 道可用素材`);
    heading.append(el('strong', '', domain.name), availableLabel);
    const switchLabel = el('label', 'student-daily-domain-switch');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = entry.enabled;
    checkbox.setAttribute('aria-label', `开启${domain.name}问答`);
    checkbox.dataset.dailyDomain = domain.id;
    switchLabel.append(checkbox, el('span', '', '加入每日问答'));
    const controls = el('fieldset', 'student-daily-domain-fields');
    const fields = el('div', 'student-daily-fields');
    const count = numberInput(entry.count, 1, 20, `${domain.name}每日题数`);
    count.dataset.dailyCount = domain.id;
    const defaultPoints = numberInput(entry.points[0] ?? 1, 0, 100, `${domain.name}默认积分`);
    const pointsField = field('每题默认积分', defaultPoints);
    pointsField.append(el('small', 'student-daily-help', '默认每题相同；如需例外，可在下方逐题设置。'));
    fields.append(field('每天几道题', count), pointsField);
    const poolMessage = el('p', 'student-daily-help');
    poolMessage.dataset.dailyPool = domain.id;
    function updatePool() {
      const available = domain.questionTags
        ? domain.questionTags.filter((tags) => !entry.tags.length || tags.some((tag) => entry.tags.includes(tag))).length
        : domain.availableCount;
      poolMessage.textContent = `当前范围有 ${available} 道素材${available < entry.count ? '，少于计划题数，建议补充素材或减少题数。' : '。'}`;
      poolMessage.classList.toggle('is-warning', available < entry.count);
    }
    const tags = el('div', 'student-daily-tags');
    const tagSearch = el('input', 'textbox');
    tagSearch.type = 'search';
    tagSearch.placeholder = '搜索知识点';
    tags.append(
      el('strong', '', '知识点范围'),
      el('p', 'student-daily-help', '不选表示全部；选多个时，包含任一知识点即可。新增的同标签选择题、判断题也会自动加入选题范围。'),
    );
    const tagList = el('div', 'student-daily-tag-list');
    const emptyTags = el('p', 'student-daily-help', '还没有带标签的选择题或判断题素材。');
    tagSearch.setAttribute('aria-label', `${domain.name}搜索知识点`);
    function filterTags() {
      [...tagList.children].forEach((label: HTMLElement) => {
        label.hidden = !label.dataset.tag.toLowerCase().includes(tagSearch.value.trim().toLowerCase());
      });
    }
    tagSearch.addEventListener('input', filterTags);
    tags.append(tagSearch, tagList, emptyTags);
    function updateTags() {
      const previousScroll = tagList.scrollTop;
      const focusedTag = doc.activeElement?.closest<HTMLElement>('[data-tag]');
      const hadTagFocus = focusedTag && tagList.contains(focusedTag);
      const tagChoices = [...(domain.tags || [])];
      entry.tags.filter((tag) => !tagChoices.some((item) => item.name === tag)).forEach((tag) => tagChoices.push({ name: tag, count: 0 }));
      const labels = new Map([...tagList.querySelectorAll<HTMLLabelElement>('label[data-tag]')].map((label) => [label.dataset.tag, label]));
      for (const [name, label] of labels) {
        if (!tagChoices.some((tag) => tag.name === name)) label.remove();
      }
      for (const tag of tagChoices) {
        let label = labels.get(tag.name);
        if (!label) {
          label = el('label');
          label.dataset.tag = tag.name;
          const input = el('input');
          input.type = 'checkbox';
          input.checked = entry.tags.includes(tag.name);
          input.setAttribute('aria-label', `${domain.name}知识点：${tag.name}`);
          input.addEventListener('change', () => {
            entry.tags = input.checked ? [...entry.tags, tag.name] : entry.tags.filter((value) => value !== tag.name);
            updatePool();
          });
          label.append(input, doc.createTextNode(tag.name), el('small'));
          tagList.append(label);
        }
        label.querySelector('small').textContent = `${tag.count}`;
      }
      const lostFocus = hadTagFocus && !tagList.contains(focusedTag);
      tagSearch.hidden = tagChoices.length <= 6 && !tagSearch.value && doc.activeElement !== tagSearch && !lostFocus;
      emptyTags.hidden = tagChoices.length > 0;
      filterTags();
      tagList.scrollTop = previousScroll;
      if (lostFocus) tagSearch.focus({ preventScroll: true });
    }
    domainCatalogViews.set(domain.id, () => {
      availableLabel.textContent = `${domain.availableCount} 道可用素材`;
      updateTags();
      updatePool();
    });
    updateTags();
    const custom = el('details', 'student-daily-points');
    custom.append(el('summary', '', '逐题设置积分'));
    const grid = el('div', 'student-daily-points-grid');
    custom.append(grid);
    function renderPoints() {
      grid.replaceChildren();
      entry.points.forEach((point, pointIndex) => {
        const input = numberInput(point, 0, 100, `${domain.name}第 ${pointIndex + 1} 题积分`);
        input.dataset.dailyPoint = `${domain.id}:${pointIndex}`;
        input.addEventListener('input', () => {
          entry.points[pointIndex] = input.valueAsNumber;
          updateSummary();
        });
        grid.append(field(`第 ${pointIndex + 1} 题`, input));
      });
    }
    count.addEventListener('input', () => {
      entry.count = count.valueAsNumber;
      if (Number.isInteger(entry.count) && entry.count >= 1 && entry.count <= 20) {
        entry.points = Array.from({ length: entry.count }, (_, pointIndex) => entry.points[pointIndex] ?? defaultPoints.valueAsNumber);
        renderPoints();
      }
      updatePool();
      updateSummary();
    });
    defaultPoints.addEventListener('input', () => {
      entry.points = entry.points.map(() => defaultPoints.valueAsNumber);
      renderPoints();
      updateSummary();
    });
    checkbox.addEventListener('change', () => {
      entry.enabled = checkbox.checked;
      if (entry.enabled) card.open = true;
      updateSummary();
    });
    controls.append(
      fields,
      tags,
      poolMessage,
      custom,
      el('p', 'student-daily-help', '答对才获得该题积分；设为 0 表示不加分。积分顺序按本课堂题目顺序计算。'),
    );
    if (domain.createUrl) {
      const create = el('a', 'student-text-button', '管理客观题素材 ↗');
      create.href = domain.createUrl;
      create.target = '_blank';
      create.rel = 'noopener';
      controls.append(create);
    }
    card.append(heading, switchLabel, controls);
    content.append(card);
    domainViews.push({ fieldset: controls, checkbox });
    renderPoints();
    updatePool();
  });
  updateSummary();

  function applyCatalog(nextDomains: QuizDomain[]) {
    for (const domain of domains) {
      const fresh = nextDomains.find((item) => item.id === domain.id);
      if (!fresh || !Array.isArray(fresh.tags)) continue;
      domain.tags = fresh.tags.filter((tag) => typeof tag?.name === 'string' && Number.isFinite(tag.count));
      domain.availableCount = Number.isFinite(fresh.availableCount) ? fresh.availableCount : domain.availableCount;
      domain.questionTags = Array.isArray(fresh.questionTags) ? fresh.questionTags : domain.questionTags;
      domainCatalogViews.get(domain.id)?.();
    }
  }
  async function refreshCatalog(automatic = false) {
    if (!editor.isConnected || (automatic && catalogController)) return;
    const request = ++catalogRequest;
    catalogController?.abort();
    const controller = new win.AbortController();
    catalogController = controller;
    const timeout = win.setTimeout(() => controller.abort(), 20000);
    catalogRefresh.disabled = true;
    catalogRefresh.textContent = '正在刷新…';
    catalogStatus.textContent = '正在读取最新的题目标签…';
    catalogStatus.classList.remove('is-error');
    const url = new win.URL(win.location.href);
    const uid = form.querySelector<HTMLInputElement>('input[name="uid"]')?.value;
    if (uid) url.searchParams.set('uid', uid);
    try {
      const response = await win.fetch(url.href, {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('身份验证可能已过期，请完成验证后重试。');
      }
      if (!response.ok || !Array.isArray(result.selectedDailyQuiz?.domains)) throw new Error('暂时无法读取题目标签，请重试。');
      if (request !== catalogRequest || controller.signal.aborted || !editor.isConnected) return;
      applyCatalog(result.selectedDailyQuiz.domains);
      catalogStatus.textContent = '题目标签已更新，未保存的问答设置已保留。';
    } catch (error) {
      if (request !== catalogRequest || !editor.isConnected) return;
      catalogStatus.textContent = error.name === 'AbortError'
        ? '刷新超时，请重试。当前设置已保留。'
        : `刷新失败：${error.message || '请稍后重试。'} 当前设置已保留。`;
      catalogStatus.classList.add('is-error');
    } finally {
      win.clearTimeout(timeout);
      if (request === catalogRequest) {
        catalogController = null;
        catalogRefresh.disabled = false;
        catalogRefresh.textContent = '刷新题目标签';
      }
    }
  }
  settingsButton.addEventListener('click', () => {
    selectSubtab('settings');
    refreshCatalog();
  });
  catalogRefresh.addEventListener('click', () => refreshCatalog());
  const refreshVisibleCatalog = () => {
    if (doc.visibilityState === 'visible' && subtab === 'settings' && !form.closest('[hidden]')) refreshCatalog(true);
  };
  doc.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-student-tab="daily"]')) refreshVisibleCatalog();
  }, { signal: lifetime.signal });
  doc.addEventListener('visibilitychange', refreshVisibleCatalog, { signal: lifetime.signal });
  win.addEventListener('focus', refreshVisibleCatalog, { signal: lifetime.signal });
  const observer = new win.MutationObserver(() => {
    if (editor.isConnected) return;
    catalogRequest++;
    learningRequest++;
    learningController?.abort();
    learningView?.dispose();
    catalogController?.abort();
    lifetime.abort();
    observer.disconnect();
  });
  if (editor.parentNode) observer.observe(editor.parentNode, { childList: true });
  win.addEventListener('pagehide', (event) => {
    catalogController?.abort();
    learningController?.abort();
    if (event.persisted) return;
    learningView?.dispose();
    lifetime.abort();
    observer.disconnect();
  }, { signal: lifetime.signal });

  const recordsFeedback = el('p', 'student-editor-feedback');
  recordsFeedback.hidden = true;
  recordsFeedback.setAttribute('role', 'status');
  const learningTools = el('div', 'student-daily-learning-tools');
  const learningCopy = el('div');
  learningCopy.append(el('h3', '', '看看哪些知识点还需要巩固'), el('p', '', '查看已分配题目的掌握情况，也可以回看每次练习。'));
  const refresh = el('button', 'student-daily-refresh', '刷新掌握情况');
  refresh.type = 'button';
  refresh.dataset.quizRefresh = '';
  learningTools.append(learningCopy, refresh);
  const learningHost = el('div');
  learningHost.dataset.dailyLearning = '';
  history.replaceChildren(learningTools, recordsFeedback, learningHost);
  function renderLearning(learning?: QuizLearning) {
    learningView?.dispose();
    learningView = null;
    if (!learning) {
      const empty = el('div', 'student-daily-report-empty');
      empty.append(el('strong', '', '暂时无法读取知识掌握情况'), el('p', '', '点击刷新重新读取，当前问答设置会保留。'));
      learningHost.replaceChildren(empty);
      return;
    }
    learningView = bindDailyQuizLearning(learningHost, learning);
  }
  async function loadLearning() {
    const request = ++learningRequest;
    const catalogVersion = catalogRequest;
    learningController?.abort();
    const controller = new win.AbortController();
    learningController = controller;
    const timeout = win.setTimeout(() => controller.abort(), 20000);
    recordsFeedback.hidden = false;
    recordsFeedback.textContent = '正在读取知识掌握情况…';
    recordsFeedback.classList.remove('is-error');
    learningHost.setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    refresh.textContent = '正在刷新…';
    const url = new win.URL(win.location.href);
    const uid = form.querySelector<HTMLInputElement>('input[name="uid"]')?.value;
    if (uid) url.searchParams.set('uid', uid);
    url.searchParams.delete('quizDay');
    try {
      const response = await win.fetch(url.href, {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('身份验证可能已过期，请在另一个窗口完成验证后重试。');
      }
      if (!response.ok || !result.selectedDailyQuiz?.learning) throw new Error('暂时无法读取掌握情况，请完成身份验证后重试。');
      if (request !== learningRequest || controller.signal.aborted || !editor.isConnected) return;
      if (catalogVersion === catalogRequest && !catalogController && Array.isArray(result.selectedDailyQuiz.domains)) {
        applyCatalog(result.selectedDailyQuiz.domains);
      }
      data.learning = result.selectedDailyQuiz.learning;
      renderLearning(data.learning);
      recordsFeedback.hidden = true;
    } catch (error) {
      if (request !== learningRequest || !editor.isConnected) return;
      recordsFeedback.textContent = error.name === 'AbortError'
        ? '刷新超时，请重试。已加载的掌握情况和问答设置已保留。'
        : typeof (error as Error)?.message === 'string' ? `读取失败：${(error as Error).message}` : '读取失败，请完成身份验证后重试。';
      recordsFeedback.classList.add('is-error');
    } finally {
      win.clearTimeout(timeout);
      if (request === learningRequest) {
        learningController = null;
        learningHost.removeAttribute('aria-busy');
        refresh.disabled = false;
        refresh.textContent = '刷新掌握情况';
      }
    }
  }
  recordsButton.addEventListener('click', () => {
    selectSubtab('records');
    loadLearning();
  });
  refresh.addEventListener('click', loadLearning);
  renderLearning(data.learning);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const active = policy.domains.filter((item) => item.enabled);
    const invalid = policy.domains.find(
      (item) =>
        !Number.isInteger(item.count)
        || item.count < 1
        || item.count > 20
        || item.points.length !== item.count
        || item.points.some((point) => !Number.isInteger(point) || point < 0 || point > 100),
    );
    if (invalid || !Number.isInteger(policy.cooldownRounds) || policy.cooldownRounds < 1 || policy.cooldownRounds > 30) {
      message('请检查题数（1–20）、积分（0–100）与间隔轮数（1–30）。', true);
      return;
    }
    if (active.length > 10 || active.reduce((sum, item) => sum + item.count, 0) > 50) {
      message('每日问答最多开启 10 个课堂、合计 50 道题。', true);
      return;
    }
    if (policy.enabled && !active.length) {
      message('请至少开启一个课堂，或关闭每日问答。', true);
      return;
    }
    pending = true;
    const save = form.querySelector<HTMLButtonElement>('[data-daily-save]');
    save.disabled = true;
    save.textContent = '正在保存…';
    const body = new win.FormData(form);
    body.set('policy', JSON.stringify(policy));
    const saving = JSON.stringify(policy);
    const catalogVersion = catalogRequest;
    message('');
    try {
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
        throw new Error('身份验证可能已过期。请在另一个窗口完成验证后重试，当前设置已保留。');
      }
      if (!response.ok || !result.saved) throw new Error(result.error?.message || result.message || '保存未完成，请重试。');
      if (catalogVersion === catalogRequest && !catalogController && Array.isArray(result.selectedDailyQuiz?.domains) && editor.isConnected) {
        applyCatalog(result.selectedDailyQuiz.domains);
      }
      baseline = saving;
      onSaved(JSON.parse(saving).enabled);
      message('问答设置已保存，将用于下一轮问答。');
    } catch (error) {
      message(typeof (error as Error)?.message === 'string' ? (error as Error).message : '保存失败，请重试。当前设置已保留。', true);
    } finally {
      pending = false;
      save.disabled = false;
      save.textContent = '保存问答设置';
    }
  });
  return { isDirty: () => JSON.stringify(policy) !== baseline, isPending: () => pending };
}
