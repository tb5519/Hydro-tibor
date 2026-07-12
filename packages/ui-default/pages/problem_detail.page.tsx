import { NORMAL_STATUS, STATUS, STATUS_TEXTS } from '@hydrooj/common';
import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { confirm, InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, loadReactRedux, pjax, request, tpl,
} from 'vj/utils';
import { openDB } from 'vj/utils/db';

class ProblemPageExtender {
  isExtended = false;
  inProgress = false;
  $content = $('.problem-content-container');
  $contentBound = this.$content.closest('.section');
  $scratchpadContainer = $('.scratchpad-container');

  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    // @ts-ignore
    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await delay(100);

    $('body').addClass('header--collapsed mode--scratchpad');
    await this.$scratchpadContainer
      .css({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      })
      .show()
      .transition({
        // @ts-ignore
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    $('.main > .row').hide();
    $('.footer').hide();
    $(window).scrollTop(0);
    window.document.body.style.overflow = 'hidden';

    this.inProgress = false;
    this.isExtended = true;
  }

  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;

    $(window).scrollTop(0);
    $('.main > .row').show();
    $('.footer').show();

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    $('body').removeClass('header--collapsed mode--scratchpad');

    await this.$scratchpadContainer
      .transition({
        // @ts-ignore
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$scratchpadContainer.hide();
    // @ts-ignore
    this.$content.transition({ opacity: 1 }, { duration: 100 });
    window.document.body.style.overflow = 'scroll';

    this.inProgress = false;
    this.isExtended = false;
  }

  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], async () => {
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();
  const normalStatuses = new Set(NORMAL_STATUS);
  const recordPretestId = '000000000000000000000000';
  const recordGenerateId = '000000000000000000000001';
  let firstFormalRecordStatus = Number.isFinite(+UiContext.firstFormalRecordStatus)
    ? +UiContext.firstFormalRecordStatus
    : null;
  let hasWrongFormalRecord = !!UiContext.hasWrongFormalRecord;
  let sawCurrentWrongFormalRecord = false;
  const watchedFormalSubmitRids = new Set<string>();
  const pollingFormalSubmitRids = new Set<string>();
  const reportedFormalSubmitRids = new Set<string>();
  const contestProgressDetails = {
    ...(UiContext.tsdoc?.detail || {}),
  } as Record<string, any>;

  function isContestSubmitFeedbackEnabled() {
    return UiContext.isContestProblem === true;
  }

  function isFinalRecordStatus(status: number) {
    return normalStatuses.has(status as STATUS) || status === STATUS.STATUS_CANCELED;
  }

  function normalizeContestScore(value: number) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.round((score + Number.EPSILON) * 100) / 100;
  }

  function formatContestScore(value: number) {
    const rounded = normalizeContestScore(value);
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function getContestProblemScore(pid: number) {
    const score = Number(UiContext.tdoc?.score?.[pid] ?? 100);
    return Number.isFinite(score) ? score : 100;
  }

  function getContestRecordScore(rdoc: any) {
    const score = Number(rdoc?.score);
    return Number.isFinite(score) ? Math.max(0, score) : 0;
  }

  function getContestStatusText(status: number) {
    if (status === STATUS.STATUS_ACCEPTED) return 'AC';
    return STATUS_TEXTS[status] || '评测完成';
  }

  function updateContestProgress(rdoc: any) {
    const pid = Number(rdoc?.pid);
    if (!Number.isFinite(pid) || !UiContext.tdoc?.pids?.some((item) => Number(item) === pid)) return;

    const key = `${pid}`;
    const previous = contestProgressDetails[key];
    const rule = UiContext.tdoc.rule;
    if (rule === 'oi') {
      if (!previous || getContestRecordScore(rdoc) >= getContestRecordScore(previous)) contestProgressDetails[key] = rdoc;
      return;
    }
    if (rule === 'acm') {
      if (!previous || previous.status !== STATUS.STATUS_ACCEPTED) contestProgressDetails[key] = rdoc;
      return;
    }
    if (!previous || getContestRecordScore(rdoc) >= getContestRecordScore(previous)) {
      contestProgressDetails[key] = rdoc;
    }
  }

  function getContestProgressSummary() {
    const pids = UiContext.tdoc?.pids || [];
    let totalScore = 0;
    let maxTotalScore = 0;
    let acceptedCount = 0;
    for (const rawPid of pids) {
      const pid = Number(rawPid);
      maxTotalScore = normalizeContestScore(maxTotalScore + getContestProblemScore(pid));
      const detail = contestProgressDetails[pid];
      if (!detail) continue;
      totalScore = normalizeContestScore(totalScore + getContestProblemScore(pid) * getContestRecordScore(detail) / 100);
      if (+detail.status === STATUS.STATUS_ACCEPTED) acceptedCount++;
    }
    return {
      totalScore,
      maxTotalScore,
      acceptedCount,
      remainingCount: Math.max(0, pids.length - acceptedCount),
    };
  }

  function updateMistakePromptPosition() {
    const prompt = document.querySelector<HTMLElement>('.problem-mistake-float');
    if (!prompt) return;
    if (!document.body.classList.contains('mode--scratchpad')) {
      prompt.style.removeProperty('--problem-mistake-left');
      prompt.style.removeProperty('--problem-mistake-bottom');
      return;
    }
    const editorElement = document.querySelector<HTMLElement>('.monaco-editor')
      || document.querySelector<HTMLElement>('.splitpane-fill')
      || document.querySelector<HTMLElement>('.scratchpad__toolbar');
    const editorRect = editorElement?.getBoundingClientRect();
    if (editorRect && editorRect.width > 0) {
      prompt.style.setProperty('--problem-mistake-left', `${Math.max(12, editorRect.left + 12)}px`);
    }

    const panelTitles = Array.from(document.querySelectorAll<HTMLElement>('.scratchpad__panel-title'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const recordsTitle = panelTitles.find((element) => {
      const text = (element.textContent || '').trim().toLowerCase();
      return text.includes('评测记录') || text.includes('record');
    }) || panelTitles[panelTitles.length - 1];
    const recordsRect = recordsTitle?.getBoundingClientRect();
    if (recordsRect && recordsRect.top > 0 && recordsRect.top < window.innerHeight) {
      prompt.style.setProperty('--problem-mistake-bottom', `${Math.max(72, window.innerHeight - recordsRect.top + 8)}px`);
    }
  }

  function revealMistakePrompt() {
    updateMistakePromptPosition();
    $('.problem-mistake-float').removeClass('problem-mistake-float--hidden');
  }

  function getRecordId(rdoc) {
    const id = rdoc?._id;
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (id.toHexString) return id.toHexString();
    return `${id}`;
  }

  function getRecordContestId(rdoc) {
    const contest = rdoc?.contest;
    if (!contest) return '';
    if (typeof contest === 'string') return contest;
    if (contest.$oid) return contest.$oid;
    if (contest.toHexString) return contest.toHexString();
    return `${contest}`;
  }

  function isFormalRecord(rdoc, store) {
    if (!rdoc) return false;
    const recordId = getRecordId(rdoc);
    const state = store.getState();
    const contestId = getRecordContestId(rdoc);
    if (contestId === recordGenerateId) return false;
    if (Object.hasOwn(rdoc, 'input')) return false;
    const pretestRid = state?.pretest?.rid;
    if (recordId && pretestRid && recordId === pretestRid) return false;
    if (recordId && (state?.ui?.formalSubmitRids || []).some((rid) => getRecordId({ _id: rid }) === recordId)) return true;
    if (contestId === recordPretestId) return false;
    return true;
  }

  function isCurrentFormalSubmitRecord(store, rdoc) {
    const recordId = getRecordId(rdoc);
    if (!recordId) return false;
    return (store.getState()?.ui?.formalSubmitRids || [])
      .some((rid) => getRecordId({ _id: rid }) === recordId);
  }

  function showContestSubmitResult(store, rdoc: any) {
    if (!isContestSubmitFeedbackEnabled() || !isCurrentFormalSubmitRecord(store, rdoc)) return;
    const recordId = getRecordId(rdoc);
    const status = +rdoc.status;
    if (!recordId || !isFinalRecordStatus(status) || reportedFormalSubmitRids.has(recordId)) return;
    reportedFormalSubmitRids.add(recordId);

    updateContestProgress(rdoc);
    const pid = Number(rdoc.pid);
    const maxScore = getContestProblemScore(pid);
    const problemScore = normalizeContestScore(maxScore * getContestRecordScore(rdoc) / 100);
    const {
      totalScore, maxTotalScore, acceptedCount, remainingCount,
    } = getContestProgressSummary();
    const accepted = status === STATUS.STATUS_ACCEPTED;
    const isAcm = UiContext.tdoc?.rule === 'acm';

    new InfoDialog({
      classes: 'dialog--contest-submit-result',
      width: '36rem',
      $body: tpl(
        <div className="contest-submit-result">
          <div className="contest-submit-result__header">
            <div>
              <div className="contest-submit-result__eyebrow">比赛评测完成</div>
              <div className="contest-submit-result__title">
                {accepted ? '本题 AC，继续加油！' : (
                  <>
                    <span className="contest-submit-result__title-line">本题已评测</span>
                    <span className="contest-submit-result__title-line contest-submit-result__title-line--hint">可尝试修改代码继续评测直至AC</span>
                  </>
                )}
              </div>
            </div>
            <div className={`contest-submit-result__status${accepted ? ' is-accepted' : ''}`}>
              {getContestStatusText(status)}
            </div>
          </div>
          <div className="contest-submit-result__score-grid">
            <div className="contest-submit-result__score-card">
              <span>本题得分</span>
              <strong>{formatContestScore(problemScore)}<small> / {formatContestScore(maxScore)}</small></strong>
            </div>
            <div className="contest-submit-result__score-card">
              <span>{isAcm ? '已完成题目' : '比赛累计得分'}</span>
              <strong>
                {isAcm ? `${acceptedCount} 题` : (
                  <>{formatContestScore(totalScore)}<small> / {formatContestScore(maxTotalScore)}</small></>
                )}
              </strong>
            </div>
          </div>
          <div className="contest-submit-result__summary">
            <span><b>{acceptedCount}</b> 题已 AC</span>
            <span><b>{remainingCount}</b> 题待完成</span>
          </div>
        </div>,
      ),
    }).open();
  }

  function getKnownFormalRecords(store) {
    return (Object.values(store.getState()?.records?.items || {}) as any[])
      .filter((rdoc) => {
        const status = +rdoc?.status;
        return normalStatuses.has(status as STATUS) && isFormalRecord(rdoc, store);
      })
      .sort((a, b) => getRecordId(a).localeCompare(getRecordId(b)));
  }

  function maybeRevealMistakePrompt(store, rdoc = null) {
    if (!UiContext.isMistakeSupported || !UiContext.canUseMistake) return;
    const $prompt = $('.problem-mistake-float');
    if (!$prompt.length || !$prompt.hasClass('problem-mistake-float--hidden')) return;
    if ($prompt.attr('data-mistake-state')) return;

    if (rdoc && isFormalRecord(rdoc, store)) {
      const pushedStatus = +rdoc.status;
      if (normalStatuses.has(pushedStatus as STATUS)) {
        if (pushedStatus !== STATUS.STATUS_ACCEPTED) {
          hasWrongFormalRecord = true;
          sawCurrentWrongFormalRecord = true;
        }
        if (firstFormalRecordStatus === null) firstFormalRecordStatus = pushedStatus;
      }
    }

    const records = getKnownFormalRecords(store);
    if (!records.length) return;
    if (firstFormalRecordStatus === null) firstFormalRecordStatus = +records[0].status;

    const latestRecord = records[records.length - 1];
    const latestStatus = +latestRecord.status;
    if (latestStatus !== STATUS.STATUS_ACCEPTED) return;

    const latestId = getRecordId(latestRecord);
    const hasKnownWrongBeforeLatest = records.some((record) => {
      const recordStatus = +record.status;
      const recordId = getRecordId(record);
      return recordStatus !== STATUS.STATUS_ACCEPTED
        && (!latestId || !recordId || recordId.localeCompare(latestId) < 0);
    });
    const latestIsCurrentSubmit = isCurrentFormalSubmitRecord(store, latestRecord);
    if (latestIsCurrentSubmit && (
      sawCurrentWrongFormalRecord
      || hasWrongFormalRecord
      || hasKnownWrongBeforeLatest
      || (firstFormalRecordStatus !== null && firstFormalRecordStatus !== STATUS.STATUS_ACCEPTED)
    )) {
      revealMistakePrompt();
    }
  }

  function getRecordDetailConnUrl(recordId: string) {
    if (UiContext.contestSubmitFeedbackConnUrl) {
      return UiContext.contestSubmitFeedbackConnUrl.replace('{rid}', encodeURIComponent(recordId));
    }
    const query = new URLSearchParams({
      domainId: UiContext.pdoc.domainId,
      rid: recordId,
      noTemplate: '1',
    });
    return `record-detail-conn?${query.toString()}`;
  }

  function getContestSubmitFeedbackUrl(recordId: string) {
    if (!UiContext.contestSubmitFeedbackUrl) return '';
    return UiContext.contestSubmitFeedbackUrl.replace('{rid}', encodeURIComponent(recordId));
  }

  function receiveFormalSubmitRecord(store, rdoc: any) {
    store.dispatch({
      type: 'SCRATCHPAD_RECORDS_PUSH',
      payload: { rdoc },
    });
    maybeRevealMistakePrompt(store, rdoc);
    showContestSubmitResult(store, rdoc);
  }

  function pollFormalSubmitRecord(store, rid) {
    const recordId = getRecordId({ _id: rid });
    const feedbackUrl = getContestSubmitFeedbackUrl(recordId);
    if (!recordId || (!feedbackUrl && !UiContext.getSubmissionsUrl) || pollingFormalSubmitRids.has(recordId)) return;
    pollingFormalSubmitRids.add(recordId);

    let attempts = 0;
    const poll = async () => {
      if (reportedFormalSubmitRids.has(recordId)) {
        pollingFormalSubmitRids.delete(recordId);
        return;
      }

      attempts++;
      try {
        const result = await request.get(feedbackUrl || UiContext.getSubmissionsUrl);
        const rdoc = feedbackUrl
          ? result?.rdoc
          : result?.rdocs?.find((item) => getRecordId(item) === recordId);
        if (rdoc) {
          receiveFormalSubmitRecord(store, rdoc);
          if (isFinalRecordStatus(+rdoc.status)) {
            pollingFormalSubmitRids.delete(recordId);
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to load contest submission result:', err);
      }

      if (attempts >= 45) {
        pollingFormalSubmitRids.delete(recordId);
        return;
      }
      window.setTimeout(poll, 1200);
    };

    window.setTimeout(poll, 500);
  }

  function watchFormalSubmitRecord(store, WebSocket, rid) {
    const recordId = getRecordId({ _id: rid });
    if (!recordId || watchedFormalSubmitRids.has(recordId)) return;
    watchedFormalSubmitRids.add(recordId);
    // Poll the sanitized endpoint as a fallback for hidden contest records.
    // WebSocket delivery remains the fast path, but a result prompt must not depend on it.
    pollFormalSubmitRecord(store, rid);

    const sock = new WebSocket(UiContext.ws_prefix + getRecordDetailConnUrl(recordId));
    sock.onmessage = (message, data) => {
      let msg;
      try {
        msg = JSON.parse(data || message.data);
      } catch {
        return;
      }
      const rdoc = msg.rdoc;
      if (!rdoc) return;
      receiveFormalSubmitRecord(store, rdoc);

      const status = +rdoc.status;
      if (isFinalRecordStatus(status)) {
        setTimeout(() => sock.close(), 1000);
      }
    };
  }

  function watchFormalSubmitRecords(store, WebSocket) {
    store.subscribe(() => {
      const rids = store.getState()?.ui?.formalSubmitRids || [];
      rids.forEach((rid) => watchFormalSubmitRecord(store, WebSocket, rid));
      maybeRevealMistakePrompt(store);
    });
  }

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId], UiContext.pdoc.title);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      // @ts-ignore
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  let scratchpadModulesPromise = null;

  function loadScratchpadModules() {
    scratchpadModulesPromise ||= Promise.all([
      import('../components/socket'),
      import('../components/scratchpad'),
      import('../components/scratchpad/reducers'),
    ]).then(([socketModule, scratchpadModule, reducerModule]) => ({
      WebSocket: socketModule.default,
      ScratchpadApp: scratchpadModule.default,
      ScratchpadReducer: reducerModule.default,
    })).catch((err) => {
      scratchpadModulesPromise = null;
      throw err;
    });
    return scratchpadModulesPromise;
  }

  function preloadScratchpadModules() {
    if (reactLoaded) return;
    loadScratchpadModules().catch((err) => {
      console.error('Failed to preload scratchpad:', err);
    });
  }

  async function loadReact() {
    if (reactLoaded) return;
    $('.loader-container').show();

    const { WebSocket, ScratchpadApp, ScratchpadReducer } = await loadScratchpadModules();
    const { Provider, store } = await loadReactRedux(ScratchpadReducer);

    // @ts-ignore
    window.store = store;
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.pretestConnUrl);
    sock.onmessage = (message, data) => {
      const msg = JSON.parse(data || message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
      maybeRevealMistakePrompt(store, msg.rdoc);
    };
    watchFormalSubmitRecords(store, WebSocket);

    renderReact = () => {
      const root = createRoot($('#scratchpad').get(0));
      root.render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
      );
      unmountReact = () => root.unmount();
    };
    reactLoaded = true;
    $('.loader-container').hide();
  }

  let progress = false;

  async function enterScratchpadMode() {
    if (progress) return;
    progress = true;
    try {
      await loadReact();
      await extender.extend();
      renderReact();
      setTimeout(updateMistakePromptPosition, 0);
      await scratchpadFadeIn();
    } catch (err) {
      console.error('Failed to open scratchpad:', err);
      Notification.error('在线编辑器加载失败，请刷新页面后重试。');
      if (extender.isExtended) {
        try {
          await extender.collapse();
        } catch (collapseErr) {
          console.error('Failed to restore problem page:', collapseErr);
        }
      }
      $('.loader-container').hide();
      $('#scratchpad').css({ opacity: 0 });
    } finally {
      progress = false;
    }
  }

  async function leaveScratchpadMode() {
    if (progress) return;
    progress = true;
    await scratchpadFadeOut();
    $('.problem-content-container').append($('.problem-content'));
    await extender.collapse();
    unmountReact();
    progress = false;
  }

  async function loadObjective() {
    $('.outer-loader-container').show();
    document.documentElement.classList.add('objective-problem-mode');
    document.body.classList.add('objective-problem-mode');
    const ans = {};
    const pids = [];
    let cnt = 0;
    const reg = /\{\{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) \}\}/g;
    $('.problem-content .typo').children().each((i, e) => {
      if (e.tagName === 'PRE' && !e.children[0].className.includes('#input')) return;
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
          $(e).next('ul').addClass(`objective-options objective-options--${type === 'select' ? 'single' : 'multi'}`);
          $(e).next('ul').children().each((j, ele) => {
            const letter = String.fromCharCode(65 + j);
            $(ele).after(tpl`
              <label class="objective_${id} radiobox objective-option" id="p${id}">
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

    let setUpdate;
    const db = await openDB;
    async function saveAns() {
      await db.put('solutions', {
        id: `${cacheKey}#objective`,
        value: JSON.stringify(ans),
      });
    }
    async function clearAns() {
      if (!(await confirm(i18n('All changes will be lost. Are you sure to clear all answers?')))) return;
      await db.delete('solutions', `${cacheKey}#objective`);
      window.location.reload();
    }

    function ProblemNavigation() {
      [, setUpdate] = React.useState(0);
      const update = React.useCallback(() => { setUpdate?.((v) => v + 1); }, []);
      React.useEffect(() => {
        $(document).on('click', update);
        $(document).on('input', update);
        return () => {
          $(document).off('click', update);
          $(document).off('input', update);
        };
      }, [update]);
      return <>
        <div className="objective-nav-card">
          <div className="objective-nav-title">答题卡</div>
          <div className="contest-problems objective-nav-grid">
            {pids.map((i) => <a href={`#p${i}`} key={i} className={ans[i] ? 'pending objective-nav-item is-answered' : 'objective-nav-item'}>
            <span className="id">{i}</span>
            </a>)}
          </div>
          <div className="objective-nav-legend">
            <span><i className="objective-nav-dot objective-nav-dot--answered" /> 已答</span>
            <span><i className="objective-nav-dot" /> 未答</span>
          </div>
        </div>
        <li className="menu__item">
          <button className="menu__link" onClick={clearAns}>
            <span className="icon icon-erase" /> {i18n('Clear answers')}
          </button>
        </li>
      </>;
    }

    async function loadAns() {
      const saved = await db.get('solutions', `${cacheKey}#objective`);
      if (typeof saved?.value !== 'string') return;
      const isValidOption = (v) => v.length === 1 && v.charCodeAt(0) >= 65 && v.charCodeAt(0) <= 90;
      Object.assign(ans, JSON.parse(saved?.value || '{}'));
      for (const [id, val] of Object.entries(ans)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (isValidOption(v)) $(`.objective_${id} input[value="${v}"]`).prop('checked', true);
          }
        } else if (val) {
          $(`.objective_${id} input[type=text], .objective_${id} textarea`).val(val.toString());
          if (isValidOption(val)) $(`.objective_${id}.radiobox [value="${val}"]`).prop('checked', true);
        }
      }
      setUpdate?.((v) => v + 1);
    }

    function setAnswer(name: string, value: string | string[]) {
      if (Array.isArray(value)) {
        if (value.length) ans[name] = value;
        else delete ans[name];
      } else if (value) ans[name] = value;
      else delete ans[name];
      setUpdate?.((v) => v + 1);
    }

    if (cnt) {
      await loadAns();
      $('.problem-content .typo').append(document.getElementsByClassName('nav__item--round').length
        ? `<input type="submit" disabled class="button rounded primary disabled" value="${i18n('Login to Submit')}" />`
        : `<input type="submit" class="button rounded primary" value="${i18n('Submit')}" />`);
      $('.objective-input[type!=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        setAnswer(e.target.name, e.target.value);
        saveAns();
      });
      $('input.objective-input[type=checkbox]').on('input', (e: JQuery.TriggeredEvent<HTMLInputElement>) => {
        const current = Array.isArray(ans[e.target.name]) ? ans[e.target.name] : [];
        if (e.target.checked) {
          setAnswer(e.target.name, [...new Set([...current, e.target.value])].sort((a: string, b: string) => a.charCodeAt(0) - b.charCodeAt(0)));
        } else {
          setAnswer(e.target.name, current.filter((v) => v !== e.target.value));
        }
        saveAns();
      });
      $('input[type="submit"]').on('click', (e) => {
        e.preventDefault();
        request
          .post(UiContext.postSubmitUrl, {
            lang: '_',
            code: yaml.dump(ans),
          })
          .then((res) => {
            window.location.href = res.url;
          })
          .catch((err) => {
            Notification.error(err.message);
          });
      });
    }
    if (!document.getElementById('problem-navigation')) {
      const ele = document.createElement('div');
      ele.id = 'problem-navigation';
      $('.section--problem-sidebar ol.menu').prepend(ele);
      createRoot(document.getElementById('problem-navigation')).render(<ProblemNavigation />);
    }
    $('.non-scratchpad--hide').hide();
    $('.scratchpad--hide').hide();
    $('.outer-loader-container').hide();
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('mouseenter focus touchstart', '[name="problem-sidebar__open-scratchpad"]', preloadScratchpadModules);
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[data-lang]', (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', ev.currentTarget.dataset.lang);
    $('[data-lang]').removeClass('tab--active');
    pjax.request({ url: url.toString() });
    $(ev.currentTarget).addClass('tab--active');
  });
  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download"]').on('click', handleClickDownloadProblem);
  $(window).on('resize', updateMistakePromptPosition);
  $('#scratchpad').on('vjScratchpadRelayout', updateMistakePromptPosition);
  if (UiContext.pdoc.config?.type === 'objective') {
    loadObjective();
    $(document).on('vjContentNew', loadObjective);
  } else if (new URL(window.location.href).searchParams.get('scratchpad') === '1') {
    enterScratchpadMode();
  }
});

export default page;
