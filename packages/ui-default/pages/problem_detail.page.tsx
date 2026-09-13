import { NORMAL_STATUS, STATUS, STATUS_TEXTS } from '@hydrooj/common';
import $ from 'jquery';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, loadReactRedux, pjax, request, tpl,
} from 'vj/utils';
import { createBadgeAcThemePlayer } from '../components/badge_ac_effect';
import { ContestPoints } from '../components/contest_points';
import { copyHomeworkReviewToOwnDraft } from '../components/homework_review_copy';
import { bindMistakePracticeActions } from '../components/mistake_practice';
import { loadObjective } from '../components/objective/objective';
import { bindProblemRecordPicker } from '../components/problem_record_picker';
import { prepareRecordReplayDraft } from '../components/record_replay_import';

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
  bindMistakePracticeActions(document, (url, data) => request.post(url, data));
  bindProblemRecordPicker();
  try {
    if (!UiContext.objectiveMergedReview) await prepareRecordReplayDraft();
  } catch (error) {
    UiContext.recordReplay = null;
    Notification.error(`填入未完成：${error.message || '请检查浏览器是否允许保存草稿。'}`);
  }
  let mistakePromptDismissed = false;
  $(document).off('click.mistakePromptClose').on('click.mistakePromptClose', '[data-mistake-prompt-close]', (event) => {
    event.preventDefault();
    mistakePromptDismissed = true;
    $('.problem-mistake-float').addClass('problem-mistake-float--hidden');
  });
  let copyingReview = false;
  $(document).off('click.homeworkReviewCopy').on('click.homeworkReviewCopy', '[data-homework-review-copy]', async (event) => {
    event.preventDefault();
    if (UiContext.objectiveMergedReview || !UiContext.homeworkReview?.ownAnswerUrl || copyingReview) return;
    copyingReview = true;
    const $buttons = $('[data-homework-review-copy]');
    $buttons.prop('disabled', true).attr('aria-busy', 'true');
    try {
      const url = await copyHomeworkReviewToOwnDraft();
      window.location.assign(url);
    } catch (error) {
      Notification.error(`复制未完成：${error.message || '请检查浏览器是否允许保存草稿。'}`);
      copyingReview = false;
      $buttons.prop('disabled', false).removeAttr('aria-busy');
    }
  });
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();
  const normalStatuses = new Set(NORMAL_STATUS);
  const recordPretestId = '000000000000000000000000';
  const recordGenerateId = '000000000000000000000001';
  const mistakePromptChecks = new Set<string>();
  // Keep the current page's formal submissions separately from Redux. Record
  // updates can arrive before the reducer state is observed by the socket.
  const currentFormalSubmitRids = new Set<string>();
  const watchedFormalSubmitRids = new Set<string>();
  const pollingFormalSubmitRids = new Set<string>();
  const reportedFormalSubmitRids = new Set<string>();
  const formalSubmitEffectPromises = new Map<string, Promise<void>>();
  let formalSubmitEventListenerBound = false;
  let badgeAcFirstEligible = UiContext.badgeAcFirstEligible !== false;
  const badgeThemeEffect = createBadgeAcThemePlayer(UiContext.badgeAcTheme);
  const contestProgressDetails = {
    ...(UiContext.tsdoc?.detail || {}),
  } as Record<string, any>;

  function isContestSubmitFeedbackEnabled() {
    return UiContext.isContestProblem === true;
  }

  function isFinalRecordStatus(status: number) {
    return normalStatuses.has(status as STATUS) || status === STATUS.STATUS_CANCELED;
  }

  function isContestResultReady(rdoc: any) {
    return isFinalRecordStatus(+rdoc.status) && (!UiContext.tdoc?.scoreToPoints || !!rdoc.scorePointAward);
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

  function isFullScoreAccepted(rdoc: any) {
    // Hydro only marks a submission as Accepted after it earns the problem's
    // full score. The raw record score is not always normalized to 100.
    return +rdoc?.status === STATUS.STATUS_ACCEPTED;
  }

  function playBadgeThemeAcEffect() {
    return badgeThemeEffect.play();
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
    if (mistakePromptDismissed) return;
    updateMistakePromptPosition();
    $('.problem-mistake-float').removeClass('problem-mistake-float--hidden');
  }

  function getRecordId(rdoc) {
    const id = rdoc?._id ?? rdoc?.rid ?? rdoc?.recordId ?? rdoc?.id;
    if (id === undefined || id === null || id === '') return '';
    if (typeof id === 'string' || typeof id === 'number') return `${id}`;
    if (id.$oid) return `${id.$oid}`;
    if (id.oid) return `${id.oid}`;
    if (typeof id.toHexString === 'function') return id.toHexString();
    return `${id}`;
  }

  function getResponsePayloads(result: any) {
    return [
      result,
      result?.data,
      result?.data?.data,
      result?.body,
      result?.body?.data,
      result?.response,
      result?.response?.data,
    ].filter(Boolean);
  }

  function findFormalSubmitRecord(result: any, recordId: string) {
    for (const payload of getResponsePayloads(result)) {
      for (const rdoc of [payload?.rdoc, payload?.record]) {
        if (rdoc && getRecordId(rdoc) === recordId) return rdoc;
      }
      for (const records of [payload?.rdocs, payload?.records, payload?.docs, payload?.data]) {
        if (!Array.isArray(records)) continue;
        const rdoc = records.find((item: any) => getRecordId(item) === recordId);
        if (rdoc) return rdoc;
      }
    }
    return null;
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
    if (
      currentFormalSubmitRids.has(recordId)
      || watchedFormalSubmitRids.has(recordId)
      || pollingFormalSubmitRids.has(recordId)
    ) return true;
    return (store.getState()?.ui?.formalSubmitRids || [])
      .some((rid) => getRecordId({ _id: rid }) === recordId);
  }

  function showContestSubmitResult(store, rdoc: any) {
    if (!isContestSubmitFeedbackEnabled() || !isCurrentFormalSubmitRecord(store, rdoc)) return;
    const recordId = getRecordId(rdoc);
    const status = +rdoc.status;
    if (!recordId || !isContestResultReady(rdoc) || reportedFormalSubmitRids.has(recordId)) return;
    reportedFormalSubmitRids.add(recordId);

    updateContestProgress(rdoc);
    // A homework is intentionally submitted just like a normal problem. It
    // still belongs to the homework for progress and record filtering, but it
    // must not show a contest-like score/result dialog.
    if (UiContext.tdoc?.rule === 'homework') return;

    const accepted = status === STATUS.STATUS_ACCEPTED;
    const {
      acceptedCount, remainingCount,
    } = getContestProgressSummary();

    const pid = Number(rdoc.pid);
    const maxScore = getContestProblemScore(pid);
    const problemScore = normalizeContestScore(maxScore * getContestRecordScore(rdoc) / 100);
    const { totalScore, maxTotalScore } = getContestProgressSummary();
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
          <ContestPoints award={rdoc.scorePointAward} />
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

  async function maybeRevealMistakePrompt(store, rdoc = null) {
    if (mistakePromptDismissed) return;
    if (!UiContext.isMistakeSupported || !UiContext.canUseMistake) return;
    const $prompt = $('.problem-mistake-float');
    if (!$prompt.length || !$prompt.hasClass('problem-mistake-float--hidden')) return;
    if ($prompt.attr('data-mistake-state')) return;

    const knownRecords = new Map(getKnownFormalRecords(store).map((item) => [getRecordId(item), item]));
    if (rdoc && normalStatuses.has(+rdoc.status as STATUS) && isFormalRecord(rdoc, store)) {
      knownRecords.set(getRecordId(rdoc), rdoc);
    }
    const records = [...knownRecords.values()].sort((a, b) => getRecordId(a).localeCompare(getRecordId(b)));
    const latestRecord = records[records.length - 1];
    if (!latestRecord || +latestRecord.status !== STATUS.STATUS_ACCEPTED
      || !isFormalRecord(latestRecord, store) || !isCurrentFormalSubmitRecord(store, latestRecord)) return;
    const rid = getRecordId(latestRecord);
    // An earlier attempt may finish after this AC. Recheck when the known
    // terminal history changes, including a late failure from that first attempt.
    const checkKey = `${rid}/${records.map((item) => `${getRecordId(item)}:${item.status}`).join(',')}`;
    if (!rid || mistakePromptChecks.has(checkKey)) return;
    mistakePromptChecks.add(checkKey);
    try {
      // The server sees the full history, including submissions on other pages
      // and devices. Visible table rows and test runs are not evidence of a retry.
      const result = await request.post(UiContext.mistakePromptUrl, { operation: 'mistake_prompt', rid });
      if (result?.showMistakePrompt === true) revealMistakePrompt();
    } catch (error) {
      mistakePromptChecks.delete(checkKey);
      console.warn('Failed to check mistake prompt:', error);
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

  async function receiveFormalSubmitRecord(store, rdoc: any) {
    store.dispatch({
      type: 'SCRATCHPAD_RECORDS_PUSH',
      payload: { rdoc },
    });
    maybeRevealMistakePrompt(store, rdoc);

    const recordId = getRecordId(rdoc);
    if (recordId && isCurrentFormalSubmitRecord(store, rdoc) && isFinalRecordStatus(+rdoc.status)) {
      let effectPromise = formalSubmitEffectPromises.get(recordId);
      if (!effectPromise) {
        const isAccepted = isFullScoreAccepted(rdoc);
        const shouldPlayBadgeEffect = isAccepted && badgeAcFirstEligible;
        if (isAccepted) badgeAcFirstEligible = false;
        effectPromise = shouldPlayBadgeEffect ? playBadgeThemeAcEffect() : Promise.resolve();
        formalSubmitEffectPromises.set(recordId, effectPromise);
      }
      await effectPromise;
    }
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
        const rdoc = findFormalSubmitRecord(result, recordId);
        if (rdoc) {
          void receiveFormalSubmitRecord(store, rdoc);
          if (isContestResultReady(rdoc)) {
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
    if (!recordId) return;
    currentFormalSubmitRids.add(recordId);
    if (watchedFormalSubmitRids.has(recordId)) return;
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
      const rdoc = findFormalSubmitRecord(msg, recordId);
      if (!rdoc) return;
      void receiveFormalSubmitRecord(store, rdoc);

      if (isContestResultReady(rdoc)) {
        setTimeout(() => sock.close(), 1000);
      }
    };
  }

  function watchFormalSubmitRecords(store, WebSocket) {
    if (!formalSubmitEventListenerBound && typeof window !== 'undefined') {
      formalSubmitEventListenerBound = true;
      window.addEventListener('hydro:formal-submit', (event: Event) => {
        const detail = (event as CustomEvent<{ rid?: unknown }>).detail;
        const recordId = getRecordId({ _id: detail?.rid });
        if (!recordId) return;
        currentFormalSubmitRids.add(recordId);
        watchFormalSubmitRecord(store, WebSocket, recordId);
      });
    }
    const syncFormalSubmitRecords = () => {
      const rids = store.getState()?.ui?.formalSubmitRids || [];
      rids.forEach((rid) => {
        const recordId = getRecordId({ _id: rid });
        if (recordId) currentFormalSubmitRids.add(recordId);
        watchFormalSubmitRecord(store, WebSocket, rid);
      });
      maybeRevealMistakePrompt(store);
    };
    syncFormalSubmitRecords();
    store.subscribe(syncFormalSubmitRecords);
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
    if (!UiContext.homeworkReview) {
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
    }

    renderReact = () => {
      store.dispatch({ type: 'SCRATCHPAD_UI_OPEN' });
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
  } else if (UiContext.homeworkReview || UiContext.recordReplay || new URL(window.location.href).searchParams.get('scratchpad') === '1') {
    enterScratchpadMode();
  }
});

export default page;
