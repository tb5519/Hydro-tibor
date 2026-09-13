/* eslint ts/no-use-before-define: ["error", { "functions": false }] */
import $ from 'jquery';
import yaml from 'js-yaml';
import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { confirm, InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { STATUS_CODES, STATUS_TEXTS } from 'vj/constant/record';
import { delay, i18n, request, tpl } from 'vj/utils';
import { openDB } from 'vj/utils/db';
import { mergedResultLabel } from '../../common/objective-merged-review';
import { rememberRecordReplaySubmission } from '../record_replay_import';
import { ObjectiveResult } from './ObjectiveResult';

type Answers = Record<string, string | string[]>;
type QuestionResult = 'correct' | 'incorrect' | 'unanswered';
interface ObjectiveFeedback {
  rid: string;
  state: 'pending' | 'complete' | 'hidden' | 'error';
  score?: number;
  totalScore?: number;
  questions?: { id: string, answered: boolean, result: QuestionResult, score: number, maxScore: number }[];
  scorePointAward?: any;
}

export function hasObjectiveAnswer(value: unknown) {
  return Array.isArray(value) ? value.some((item) => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0;
}

export function sameObjectiveAnswer(first: unknown, second: unknown) {
  const normalize = (value: unknown) => (Array.isArray(value) ? [...new Set(value)].sort() : value || '');
  return JSON.stringify(normalize(first)) === JSON.stringify(normalize(second));
}

function findQuestionStart(marker: Element, previousAnswerEnd?: Element) {
  let start = marker;
  const questionNumber = /^(?:第\s*[\d一二三四五六七八九十百]+\s*题|\d+[.．、)）]\s*)/;
  while (start !== previousAnswerEnd && !questionNumber.test(start.textContent.trim())) {
    const previous = start.previousElementSibling;
    if (!previous || previous === previousAnswerEnd || previous.tagName === 'HR') break;
    if (/^H[1-6]$/.test(previous.tagName) && !questionNumber.test(previous.textContent.trim())) break;
    start = previous;
  }
  return start;
}

function correctAnswerMarkup(id: string) {
  const value = UiContext.objectiveCorrectAnswers?.[id];
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  if (!values.length || values.some((answer) => typeof answer !== 'string' || !answer.trim())) return '';
  const text = [...new Set(values)].join('、');
  return tpl`<span class="objective-correct-answer" data-objective-id="${id}" aria-label="正确答案：${text}">${text}</span>`;
}

function positionCorrectAnswer(marker: Element, id: string) {
  const badge = marker.querySelector(`.objective-correct-answer[data-objective-id="${id}"]`);
  if (!badge) return;
  let target = badge.parentElement;
  // A standalone answer marker belongs to the preceding stem paragraph/list.
  if (target.textContent.trim() === badge.textContent.trim()) {
    const previous = target.previousElementSibling;
    if (previous?.matches('p, ol:not(.objective-options), ul:not(.objective-options), h1, h2, h3, h4, h5, h6')) {
      target = previous as HTMLElement;
      while (target.lastElementChild?.matches('li, p')) target = target.lastElementChild as HTMLElement;
    }
  }
  target.appendChild(badge);
}

let releasePrevious: (() => void) | undefined;

export async function loadObjective() {
  const $statement = $('.problem-content .typo').first();
  const statement = $statement.get(0);
  if (!statement || statement.dataset.objectiveInitialized) return;
  releasePrevious?.();
  statement.dataset.objectiveInitialized = 'true';
  let disposed = false;
  let navigationRoot: ReturnType<typeof createRoot>;
  let busy = false;
  let pendingRid = '';
  let submittedAnswers: Answers = {};
  let feedback: ObjectiveFeedback | undefined;
  let stateMessage = '';
  const merged = UiContext.objectiveMergedReview;
  const mergedQuestions = new Map((merged?.questions || []).map((question) => [question.id, question]));
  const latestMergedAttempts = new Map((merged?.questions || []).map((question) => [question.id, question.attempts[question.attempts.length - 1]]));
  const readOnly = !!UiContext.homeworkReview || !!merged;
  const replay = !readOnly && UiContext.recordReplay?.objective ? UiContext.recordReplay : null;
  let replayResultActive = !!replay && UiContext.recordReplayResultActive === true;
  const loggedOut = !UserContext._id;
  let resultDialog: InfoDialog;
  const active = () => !disposed && statement.isConnected;
  releasePrevious = () => {
    disposed = true;
    navigationRoot?.unmount();
    resultDialog?.close();
    $statement.off('.objective');
  };
  $('.outer-loader-container').show();
  document.documentElement.classList.add('objective-problem-mode');
  document.body.classList.add('objective-problem-mode');
  $statement.toggleClass('objective-readonly', readOnly);
  const ans: Answers = {};
  const pids: string[] = [];
  const questionStarts = new Map<string, Element>();
  let previousAnswerEnd: Element;
  let cnt = 0;
  const reg = /\{\{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) \}\}/g;
  $statement.children().each((i, e) => {
    if (e.tagName === 'PRE' && !e.children[0]?.className.includes('#input')) return;
    const questions = [];
    let q;
    while (q = reg.exec(e.textContent)) questions.push(q); // eslint-disable-line no-cond-assign
    for (const [info, type] of questions) {
      cnt++;
      const id = info.replace(/\{\{ (input|select|multiselect|textarea)\((\d+(-\d+)?)\) \}\}/, '$2');
      const answerMarkup = correctAnswerMarkup(id);
      pids.push(id);
      questionStarts.set(id, findQuestionStart(e, previousAnswerEnd));
      previousAnswerEnd = type === 'select' || type === 'multiselect' ? e.nextElementSibling : e;
      $(e).addClass('objective-question-title').attr('data-objective-id', id);
      if (type === 'input') {
        $(e).html($(e).html().replace(info, () => answerMarkup + tpl`
          <div class="objective_${id} objective-free-answer medium-3">
            <input type="text" name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}">
          </div>
        `));
      } else if (type === 'textarea') {
        $(e).html($(e).html().replace(info, () => answerMarkup + tpl`
          <div class="objective_${id} objective-free-answer medium-6">
            <textarea name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}"></textarea>
          </div>
        `));
      } else {
        if ($(e).next()[0]?.tagName !== 'UL') {
          cnt--;
          return;
        }
        $(e).html($(e).html().replace(info, () => answerMarkup));
        $(e).next('ul').addClass(`objective-options objective-options--${type === 'select' ? 'single' : 'multi'}`);
        $(e).next('ul').children().each((j, ele) => {
          const letter = String.fromCharCode(65 + j);
          $(ele).after(tpl`
            <label class="objective_${id} radiobox objective-option">
              <input type="${type === 'select' ? 'radio' : 'checkbox'}" name="${id}" class="objective-input" value="${letter}">
              <span class="objective-choice-body">
                <span class="objective-choice-letter">${letter}</span>
                <span class="objective-choice-text">${{ templateRaw: true, html: ele.innerHTML }}</span>
              </span>
            </label>
          `);
          $(ele).remove();
        });
        positionCorrectAnswer(e, id);
      }
    }
  });

  // A marker can follow several paragraphs, an image or code. Anchor the whole
  // question, and keep existing Markdown heading ids available for other links.
  for (const [id, start] of questionStarts) {
    $(start).prepend(tpl`<span id="p${id}" class="objective-question-anchor" aria-hidden="true"></span>`);
  }

  let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
  if (UiContext.tdoc?._id && UiContext.tdoc.rule !== 'homework') cacheKey += `@${UiContext.tdoc._id}`;

  const db = await openDB.catch(() => null);
  async function saveAns() {
    if (readOnly) return;
    try {
      await db?.put('solutions', { id: `${cacheKey}#objective`, value: JSON.stringify(ans) });
    } catch { /* A storage failure must not prevent submitting answers. */ }
  }
  async function clearAns() {
    if (readOnly || busy || !(await confirm(i18n('All changes will be lost. Are you sure to clear all answers?')))) return;
    Object.keys(ans).forEach((id) => { delete ans[id]; });
    if (feedback?.state !== 'complete') feedback = undefined;
    pendingRid = '';
    stateMessage = '';
    $statement.find('.objective-input').prop('checked', false).filter('input[type=text], textarea').val('');
    await saveAns();
    decorateAnswers();
    renderNavigation();
  }

  function questionResult(id: string) {
    if (merged) {
      const result = mergedQuestions.get(id)?.result;
      return result === 'first_correct' ? 'correct' : result === 'correct_after_retry' ? 'retry-correct'
        : result === 'incorrect' ? 'incorrect' : undefined;
    }
    if (feedback?.state !== 'complete' || !hasObjectiveAnswer(ans[id]) || !sameObjectiveAnswer(ans[id], submittedAnswers[id])) return undefined;
    return feedback?.questions?.find((item) => item.id === id)?.result;
  }

  function decorateAnswers() {
    $statement.find('.objective-option, .objective-free-answer')
      .removeClass('is-correct is-retry-correct is-incorrect is-ever-selected').removeAttr('data-objective-result');
    for (const id of pids) {
      if (merged) {
        // The answer card retains cumulative progress. Options show the last
        // submitted answer, with earlier selections in yellow.
        const latest = latestMergedAttempts.get(id);
        const previous = new Set(mergedQuestions.get(id)?.attempts.slice(0, -1)
          .flatMap((attempt) => Array.isArray(attempt.answer) ? attempt.answer : [attempt.answer]));
        $statement.find(`.objective_${id}`).each((_, element) => {
          const input = element.querySelector<HTMLInputElement>('input, textarea');
          const isOption = element.classList.contains('objective-option');
          const isLatest = !isOption || input?.checked;
          const result = isLatest && latest ? latest.result : undefined;
          let description = '';
          if (result === 'correct' || result === 'incorrect') {
            element.classList.add(`is-${result}`);
            description = result === 'correct' ? '最后作答正确' : '最后作答错误';
          } else if (!isLatest && previous.has(input?.value)) {
            element.classList.add('is-ever-selected');
            description = '此前选过';
          } else if (result) {
            description = result === 'pending' ? '最后作答评测中' : '最后作答评测未完成';
          }
          if (description) element.setAttribute('data-objective-result', description);
          $(element).attr('title', description);
          $(input).attr('aria-description', description);
        });
        continue;
      }
      const result = questionResult(id);
      if (result !== 'correct' && result !== 'retry-correct' && result !== 'incorrect') continue;
      $statement.find(`.objective_${id}`).filter((_, el) =>
        !el.classList.contains('objective-option') || !!el.querySelector('input:checked'))
        .addClass(`is-${result}`).attr('data-objective-result', result === 'retry-correct' ? '重试后答对' : result === 'correct' ? '回答正确' : '回答错误');
    }
  }

  function renderNavigation() {
    navigationRoot?.render(<ProblemNavigation />);
  }

  function navigateToQuestion(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = document.getElementById(`p${id}`);
    if (!anchor) return;
    event.preventDefault();
    // Handle clicks on the number as well as its surrounding link. The global
    // anchor handler only recognizes direct <a> targets and drops query params.
    event.stopPropagation();
    const nav = document.querySelector<HTMLElement>('.nav');
    const navPosition = nav && window.getComputedStyle(nav).position;
    const navBottom = nav && (navPosition === 'fixed' || navPosition === 'sticky') ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
    const top = Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - navBottom - 16);
    $('html,body').stop(true);
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const hash = `#p${id}`;
    if (window.location.hash !== hash) window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  function ProblemNavigation() {
    const cardRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const card = cardRef.current;
      let frame = 0;
      const fitCard = () => {
        const nav = document.querySelector('.nav');
        const navPosition = nav && window.getComputedStyle(nav).position;
        const navBottom = nav && (navPosition === 'fixed' || navPosition === 'sticky') ? nav.getBoundingClientRect().bottom : 0;
        const top = Math.max(card.getBoundingClientRect().top, navBottom + 10);
        // Account for the real card offset (including homework/review headings),
        // rather than assuming it starts immediately below the site navigation.
        card.style.setProperty('--objective-card-height', `${Math.max(0, window.innerHeight - top - 16)}px`);
      };
      const scheduleFit = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(fitCard);
      };
      fitCard();
      window.addEventListener('resize', scheduleFit);
      window.addEventListener('scroll', scheduleFit, { passive: true });
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', scheduleFit);
        window.removeEventListener('scroll', scheduleFit);
      };
    }, []);
    const scored = feedback?.state === 'complete' && Number.isFinite(feedback.score);
    const modified = !!feedback && pids.some((id) => !sameObjectiveAnswer(ans[id], submittedAnswers[id]));
    const fallbackMessage = merged ? (merged.summary.pending || merged.summary.error ? '部分作答尚无评测结果，稍后刷新可查看更新。' : '')
      : feedback?.state === 'hidden' ? '本场比赛暂不公开成绩。'
        : feedback?.state === 'pending' ? '评测仍在进行。'
          : feedback?.state === 'error' ? '本次评测未完成。' : readOnly && !feedback ? '该学员暂无递交记录。' : '';
    return <>
      <div className="objective-nav-card" ref={cardRef}>
        {merged && <div className="objective-merged-source">
          <span className="objective-replay-source__label">学员合并作答</span>
          <strong>{merged.name}</strong>
          <span>汇总 {merged.submissionCount} 次提交</span>
        </div>}
        {replay && <div className="objective-replay-source">
          <span className="objective-replay-source__label">作答来源</span>
          <div className="objective-replay-source__record">
            <strong className="objective-replay-source__name" title={replay.name}>{replay.name}</strong>
            <span className={`objective-replay-source__status is-${STATUS_CODES[replay.status] || 'ignored'}`}>
              {i18n(STATUS_TEXTS[replay.status] || 'Unknown')}
            </span>
          </div>
          <div className="objective-replay-source__footer">
            <span>{replayResultActive ? '已填入我的作答，可修改后提交' : '已提交我的作答'}</span>
            <a href={replay.recordUrl}>原记录 <span aria-hidden="true">↗</span></a>
          </div>
        </div>}
        <div className="objective-nav-title">答题卡{readOnly && <span className="objective-review-label">只读查看</span>}</div>
        <div className="contest-problems objective-nav-grid" role="navigation" aria-label="题号导航">
          {pids.map((id) => {
            const result = questionResult(id);
            const answered = merged ? !!mergedQuestions.get(id)?.attempts.length : hasObjectiveAnswer(ans[id]);
            const outcome = merged ? mergedResultLabel[mergedQuestions.get(id)?.result || 'unanswered']
              : result === 'correct' ? '回答正确' : result === 'incorrect' ? '回答错误' : answered ? '已答，待评测' : '未答';
            const state = result === 'correct' || result === 'retry-correct' || result === 'incorrect'
              ? ` is-${result}` : answered ? ' is-answered' : '';
            return <a
              href={`#p${id}`}
              key={id}
              className={`objective-nav-item${state}`}
              aria-label={`第 ${id} 题，${outcome}`}
              onClick={(event) => navigateToQuestion(event, id)}
            >
              <span className="id">{id}</span>
            </a>;
          })}
        </div>
        <div className="objective-nav-footer">
          <div className="objective-nav-legend">
            {merged ? <>
              <span><i className="objective-nav-dot objective-nav-dot--correct" /> 首次答对</span>
              <span><i className="objective-nav-dot objective-nav-dot--retry-correct" /> 重试后答对</span>
              <span><i className="objective-nav-dot objective-nav-dot--incorrect" /> 错误</span>
            </> : feedback?.state === 'complete' ? <>
              <span><i className="objective-nav-dot objective-nav-dot--correct" /> 正确</span>
              <span><i className="objective-nav-dot objective-nav-dot--incorrect" /> 错误</span>
            </> : <span><i className="objective-nav-dot objective-nav-dot--answered" /> 已答</span>}
            <span><i className="objective-nav-dot" /> 未答</span>
          </div>
          {merged && <p className="objective-merged-legend-note">以可查看记录为准，首次非空作答即正确为绿色；答错后再答对为黄色。题目选项中，绿色为最后答对，红色为最后答错，黄色为此前选过。</p>}
          {merged ? <div className="objective-nav-result objective-merged-summary">
            <span className="objective-nav-result-label">累计答对</span>
            <div className="objective-nav-result-score">
              <strong>{merged.summary.firstCorrect + merged.summary.correctAfterRetry}</strong><span>/ {pids.length} 题</span>
            </div>
          </div> : <div className="objective-nav-result" aria-live="polite" aria-atomic="true">
            <span className="objective-nav-result-label">{readOnly ? '本次得分' : replayResultActive ? '原记录得分' : '最近一次得分'}</span>
            <div className="objective-nav-result-score">
              <strong>{scored ? feedback.score : '—'}</strong>
              {scored && Number.isFinite(feedback.totalScore) && <span>/ {feedback.totalScore} 分</span>}
              {!feedback && !readOnly && <span>尚未提交</span>}
              {feedback?.state === 'hidden' && <span>暂不公开</span>}
              {feedback?.state === 'pending' && <span>评测中</span>}
            </div>
            {!readOnly && scored && modified && <small className="objective-draft-note">答案已修改，重新提交后更新成绩。</small>}
          </div>}
          <div className="objective-submit-state" role="status" aria-live="polite">{stateMessage || fallbackMessage}</div>
          {!readOnly && <div className="objective-submit-actions">
            <input
              type="submit"
              className={`button rounded primary objective-submit${busy || loggedOut ? ' disabled' : ''}`}
              disabled={busy || loggedOut}
              value={loggedOut ? i18n('Login to Submit') : busy ? '正在评测…' : pendingRid ? '查看成绩' : i18n('Submit')}
              onClick={submitAnswers}
            />
            <button type="button" className="objective-clear" onClick={clearAns} disabled={busy}>
              <span className="icon icon-erase" /> {i18n('Clear answers')}
            </button>
          </div>}
        </div>
      </div>
    </>;
  }

  function sanitizeAnswers(values: unknown): Answers {
    const sanitized: Answers = {};
    if (!values || typeof values !== 'object' || Array.isArray(values)) return sanitized;
    for (const id of pids) {
      const value = values[id];
      if (typeof value === 'string') sanitized[id] = value;
      else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) sanitized[id] = [...new Set(value)].sort();
    }
    return sanitized;
  }

  async function loadAns() {
    const initial = merged ? {
      answers: Object.fromEntries(merged.questions.map((question) => [question.id, latestMergedAttempts.get(question.id)?.answer])),
      feedback: undefined,
    } : UiContext.objectiveInitialSubmission;
    submittedAnswers = sanitizeAnswers(initial?.answers);
    feedback = initial?.feedback;
    // An imported learner's pending record must not lock the teacher's draft
    // or turn their Submit button into a request for that learner's result.
    if (feedback?.state === 'pending' && !replayResultActive) pendingRid = feedback.rid;
    let values = submittedAnswers;
    if (!readOnly) {
      try {
        const saved = await db?.get('solutions', `${cacheKey}#objective`);
        if (typeof saved?.value === 'string') {
          const draft = JSON.parse(saved.value);
          // An explicitly empty draft means the learner cleared their answers.
          if (draft && typeof draft === 'object' && !Array.isArray(draft)) values = sanitizeAnswers(draft);
        }
      } catch { /* Fall back to the submitted answers if local storage is unavailable or malformed. */ }
    }
    Object.assign(ans, values);
    for (const id of pids) {
      const value = ans[id];
      const $inputs = $statement.find(`.objective_${id} .objective-input`);
      $inputs.filter('input[type=text], textarea').val(Array.isArray(value) ? value.join(',') : value || '');
      $inputs.filter('input[type=radio], input[type=checkbox]').each((_, input: HTMLInputElement) => {
        input.checked = Array.isArray(value) ? value.includes(input.value) : value === input.value;
      });
    }
    $statement.find('.objective-input').prop('disabled', readOnly);
    decorateAnswers();
  }

  function setAnswer(name: string, value: string | string[]) {
    if (readOnly || busy) return;
    if (Array.isArray(value)) {
      if (value.length) ans[name] = value;
      else delete ans[name];
    } else if (value) ans[name] = value;
    else delete ans[name];
    decorateAnswers();
    renderNavigation();
  }

  function setBusy(value: boolean, message = '') {
    busy = value;
    $statement.find('.objective-input').prop('disabled', readOnly || value);
    stateMessage = message;
    renderNavigation();
  }

  function showResult(result: ObjectiveFeedback) {
    if (!active()) return;
    const questions = result.questions || [];
    resultDialog = new InfoDialog({
      classes: 'dialog--objective-result',
      width: '32rem',
      $body: tpl(<ObjectiveResult
        score={result.score}
        totalScore={result.totalScore}
        correct={questions.filter((item) => item.result === 'correct').length}
        incorrect={questions.filter((item) => item.result === 'incorrect').length}
        unanswered={questions.filter((item) => item.result === 'unanswered').length}
        award={result.scorePointAward}
      />),
      $action: tpl`<button type="button" class="primary rounded button" data-action="ok" data-autofocus>查看答题情况</button>`,
    });
    resultDialog.$dom.find('.dialog__content').attr({ role: 'dialog', 'aria-modal': 'true', 'aria-label': '客观题成绩' });
    resultDialog.open().then(() => { if (active()) document.querySelector<HTMLInputElement>('#problem-navigation .objective-submit')?.focus(); });
  }

  async function waitForResult(rid: string, silent = false) {
    const url = UiContext.objectiveSubmitFeedbackUrl.replace('{rid}', encodeURIComponent(rid));
    const deadline = Date.now() + 60000;
    while (active() && pendingRid === rid && Date.now() < deadline) {
      const { objective } = await request.get(url, {}, { timeout: 15000 });
      if (!active() || pendingRid !== rid) return;
      if (!objective || objective.rid !== rid) throw new Error('暂时无法读取成绩，请点击“查看成绩”重试。');
      if (objective.state === 'pending') {
        await delay(800);
        continue;
      }
      pendingRid = '';
      feedback = objective;
      if (!readOnly && !replayResultActive) rememberRecordReplaySubmission(submittedAnswers, feedback);
      decorateAnswers();
      if (objective.state === 'complete') {
        setBusy(false, silent ? '' : '评测完成，答题情况已更新。');
        if (!silent) showResult(objective);
      } else if (objective.state === 'hidden') {
        setBusy(false, '递交成功，本场比赛暂不公开成绩。');
        if (!silent) Notification.info('递交成功，本场比赛暂不公开成绩。');
      } else {
        setBusy(false, '本次评测未完成，请稍后重新递交。');
        if (!silent) Notification.error('本次评测未完成，请稍后重新递交。');
      }
      return;
    }
    if (active()) setBusy(false, readOnly ? '评测仍在进行，请稍后刷新页面。' : '评测仍在进行，可点击“查看成绩”继续查询。');
  }

  async function submitAnswers(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (readOnly || loggedOut || busy || !active()) return;
    if (!UiContext.objectiveSubmitFeedbackUrl) {
      Notification.error('成绩服务暂不可用，请刷新页面后重试。');
      return;
    }
    setBusy(true, pendingRid ? '正在获取本次成绩…' : '正在递交并评测，请稍候…');
    try {
      if (!pendingRid) {
        const answersToSubmit = JSON.parse(JSON.stringify(ans));
        const response = await request.post(UiContext.postSubmitUrl, { lang: '_', code: yaml.dump(answersToSubmit) }, { timeout: 30000 });
        if (!active()) return;
        const rid = response.rid?.$oid || response.rid;
        if (typeof rid !== 'string' || !/^[a-f0-9]{24}$/i.test(rid)) throw new Error('未收到递交记录，请稍后重试。');
        submittedAnswers = answersToSubmit;
        pendingRid = rid;
        feedback = { rid, state: 'pending' };
        replayResultActive = false;
        rememberRecordReplaySubmission(submittedAnswers, feedback);
        decorateAnswers();
        renderNavigation();
      }
      await waitForResult(pendingRid);
    } catch (error) {
      if (!active()) return;
      setBusy(false, pendingRid ? '答案已递交，暂未获取到成绩；点击“查看成绩”重试。' : '递交暂未完成，请稍后重试。');
      Notification.error(error.message);
    } finally {
      if (active() && busy) setBusy(false);
    }
  }

  if (cnt) {
    await loadAns();
    if (!active()) return;
    if (!readOnly) {
      $statement.find('.objective-input[type!=checkbox]').on('input.objective', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        setAnswer(e.target.name, e.target.value);
        saveAns();
      });
      $statement.find('input.objective-input[type=checkbox]').on('input.objective', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        const currentValue = ans[e.target.name];
        const current = Array.isArray(currentValue) ? currentValue : [];
        if (e.target.checked) {
          setAnswer(e.target.name, [...new Set([...current, e.target.value])].sort((a: string, b: string) => a.charCodeAt(0) - b.charCodeAt(0)));
        } else {
          setAnswer(e.target.name, current.filter((v) => v !== e.target.value));
        }
        saveAns();
      });
    }
  }
  if (cnt) {
    $('#problem-navigation').remove();
    const ele = document.createElement('div');
    ele.id = 'problem-navigation';
    $('.section--problem-sidebar ol.menu').prepend(ele);
    navigationRoot = createRoot(ele);
    renderNavigation();
    if (pendingRid && UiContext.objectiveSubmitFeedbackUrl) {
      setBusy(true, '正在恢复评测结果…');
      waitForResult(pendingRid, true).catch(() => {
        if (active()) setBusy(false, readOnly ? '暂未获取到成绩，请稍后刷新页面。' : '暂未获取到成绩，点击“查看成绩”重试。');
      });
    }
  }
  $('.non-scratchpad--hide').hide();
  $('.scratchpad--hide').hide();
  $('.outer-loader-container').hide();
}
