/* eslint ts/no-use-before-define: ["error", { "functions": false }] */
import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { confirm, InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { delay, i18n, request, tpl } from 'vj/utils';
import { openDB } from 'vj/utils/db';
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
  let $submit: JQuery<HTMLInputElement>;
  let $state: JQuery<HTMLElement>;
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
  const ans: Answers = {};
  const pids: string[] = [];
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
      pids.push(id);
      $(e).addClass('objective-question-title').attr('data-objective-id', id);
      if (type === 'input') {
        $(e).html($(e).html().replace(info, tpl`
          <div class="objective_${id} objective-free-answer medium-3" id="p${id}">
            <input type="text" name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}">
          </div>
        `));
      } else if (type === 'textarea') {
        $(e).html($(e).html().replace(info, tpl`
          <div class="objective_${id} objective-free-answer medium-6" id="p${id}">
            <textarea name="${id}" class="textbox objective-input" placeholder="${i18n('Answer')}"></textarea>
          </div>
        `));
      } else {
        if ($(e).next()[0]?.tagName !== 'UL') {
          cnt--;
          return;
        }
        $(e).html($(e).html().replace(info, ''));
        $(e).next('ul').addClass(`objective-options objective-options--${type === 'select' ? 'single' : 'multi'}`).attr('id', `p${id}`);
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
      }
    }
  });

  let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
  if (UiContext.tdoc?._id && UiContext.tdoc.rule !== 'homework') cacheKey += `@${UiContext.tdoc._id}`;

  const db = await openDB.catch(() => null);
  async function saveAns() {
    try {
      await db?.put('solutions', { id: `${cacheKey}#objective`, value: JSON.stringify(ans) });
    } catch { /* A storage failure must not prevent submitting answers. */ }
  }
  async function clearAns() {
    if (busy || !(await confirm(i18n('All changes will be lost. Are you sure to clear all answers?')))) return;
    Object.keys(ans).forEach((id) => { delete ans[id]; });
    feedback = undefined;
    pendingRid = '';
    $statement.find('.objective-input').prop('checked', false).filter('input[type=text], textarea').val('');
    await saveAns();
    decorateAnswers();
    renderNavigation();
    $state.text('');
    $submit.val(i18n('Submit'));
  }

  function questionResult(id: string) {
    if (!hasObjectiveAnswer(ans[id]) || JSON.stringify(ans[id]) !== JSON.stringify(submittedAnswers[id])) return undefined;
    return feedback?.questions?.find((item) => item.id === id)?.result;
  }

  function decorateAnswers() {
    $statement.find('.objective-option, .objective-free-answer')
      .removeClass('is-correct is-incorrect').removeAttr('data-objective-result');
    for (const id of pids) {
      const result = questionResult(id);
      if (result !== 'correct' && result !== 'incorrect') continue;
      $statement.find(`.objective_${id}`).filter((_, el) =>
        !el.classList.contains('objective-option') || !!el.querySelector('input:checked'))
        .addClass(`is-${result}`).attr('data-objective-result', result === 'correct' ? '回答正确' : '回答错误');
    }
  }

  function renderNavigation() {
    navigationRoot?.render(<ProblemNavigation />);
  }

  function ProblemNavigation() {
    return <>
      <div className="objective-nav-card">
        <div className="objective-nav-title">答题卡</div>
        <div className="contest-problems objective-nav-grid">
          {pids.map((id) => {
            const result = questionResult(id);
            const answered = hasObjectiveAnswer(ans[id]);
            const outcome = result === 'correct' ? '回答正确' : result === 'incorrect' ? '回答错误' : answered ? '已答，待评测' : '未答';
            const state = result === 'correct' || result === 'incorrect' ? ` is-${result}` : answered ? ' is-answered' : '';
            return <a href={`#p${id}`} key={id} className={`objective-nav-item${state}`} aria-label={`第 ${id} 题，${outcome}`}>
              <span className="id">{id}</span>
            </a>;
          })}
        </div>
        <div className="objective-nav-legend">
          {feedback?.state === 'complete' ? <>
            <span><i className="objective-nav-dot objective-nav-dot--correct" /> 正确</span>
            <span><i className="objective-nav-dot objective-nav-dot--incorrect" /> 错误</span>
          </> : <span><i className="objective-nav-dot objective-nav-dot--answered" /> 已答</span>}
          <span><i className="objective-nav-dot" /> 未答</span>
        </div>
      </div>
      <li className="menu__item">
        <button className="menu__link" onClick={clearAns} disabled={busy}>
          <span className="icon icon-erase" /> {i18n('Clear answers')}
        </button>
      </li>
    </>;
  }

  async function loadAns() {
    try {
      const saved = await db?.get('solutions', `${cacheKey}#objective`);
      if (typeof saved?.value !== 'string') return;
      const values = JSON.parse(saved.value);
      for (const id of pids) {
        const value = values?.[id];
        if (typeof value !== 'string' && (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))) continue;
        ans[id] = value;
        const $inputs = $statement.find(`.objective_${id} .objective-input`);
        $inputs.filter('input[type=text], textarea').val(Array.isArray(value) ? value.join(',') : value);
        $inputs.filter('input[type=radio], input[type=checkbox]').each((_, input: HTMLInputElement) => {
          input.checked = Array.isArray(value) ? value.includes(input.value) : value === input.value;
        });
      }
    } catch { /* Ignore unavailable or malformed local drafts. */ }
  }

  function setAnswer(name: string, value: string | string[]) {
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
    $submit.prop('disabled', value).toggleClass('disabled', value)
      .val(value ? '正在评测…' : pendingRid ? '查看成绩' : i18n('Submit'));
    $statement.find('.objective-input').prop('disabled', value);
    $state.text(message);
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
    resultDialog.open().then(() => { if (active()) $submit.trigger('focus'); });
  }

  async function waitForResult(rid: string) {
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
      decorateAnswers();
      if (objective.state === 'complete') {
        setBusy(false, '评测完成，正确与错误已标记；未答题保持原色。');
        showResult(objective);
      } else if (objective.state === 'hidden') {
        setBusy(false, '递交成功，本场比赛暂不公开成绩。');
        Notification.info('递交成功，本场比赛暂不公开成绩。');
      } else {
        setBusy(false, '本次评测未完成，请稍后重新递交。');
        Notification.error('本次评测未完成，请稍后重新递交。');
      }
      return;
    }
    if (active()) setBusy(false, '评测仍在进行，可点击“查看成绩”继续查询，无需重复递交。');
  }

  async function submitAnswers(event: JQuery.ClickEvent) {
    event.preventDefault();
    if (busy || !active()) return;
    if (!UiContext.objectiveSubmitFeedbackUrl) {
      Notification.error('成绩服务暂不可用，请刷新页面后重试。');
      return;
    }
    setBusy(true, pendingRid ? '正在获取本次成绩…' : '正在递交并评测，请稍候…');
    try {
      if (!pendingRid) {
        submittedAnswers = JSON.parse(JSON.stringify(ans));
        const response = await request.post(UiContext.postSubmitUrl, { lang: '_', code: yaml.dump(submittedAnswers) }, { timeout: 30000 });
        if (!active()) return;
        const rid = response.rid?.$oid || response.rid;
        if (typeof rid !== 'string' || !/^[a-f0-9]{24}$/i.test(rid)) throw new Error('未收到递交记录，请稍后重试。');
        pendingRid = rid;
        feedback = undefined;
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
    const loggedOut = !UserContext._id;
    $submit = $<HTMLInputElement>('<input type="submit" class="button rounded primary objective-submit" />')
      .val(i18n(loggedOut ? 'Login to Submit' : 'Submit')).prop('disabled', loggedOut).toggleClass('disabled', loggedOut);
    $state = $('<span class="objective-submit-state" role="status" aria-live="polite" />');
    $statement.append($('<div class="objective-submit-actions" />').append($submit, $state));
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
    $submit.on('click.objective', submitAnswers);
  }
  if (cnt) {
    $('#problem-navigation').remove();
    const ele = document.createElement('div');
    ele.id = 'problem-navigation';
    $('.section--problem-sidebar ol.menu').prepend(ele);
    navigationRoot = createRoot(ele);
    renderNavigation();
  }
  $('.non-scratchpad--hide').hide();
  $('.scratchpad--hide').hide();
  $('.outer-loader-container').hide();
}
