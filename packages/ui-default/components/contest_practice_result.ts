import { STATUS, STATUS_SHORT_TEXTS } from '@hydrooj/common';

type PracticeWindow = Window & typeof globalThis;
const FINAL_STATUSES = new Set<number>([
  STATUS.STATUS_ACCEPTED, STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_TIME_LIMIT_EXCEEDED,
  STATUS.STATUS_MEMORY_LIMIT_EXCEEDED, STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED, STATUS.STATUS_RUNTIME_ERROR,
  STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_SYSTEM_ERROR, STATUS.STATUS_CANCELED, STATUS.STATUS_ETC,
  STATUS.STATUS_HACKED, STATUS.STATUS_IGNORED, STATUS.STATUS_FORMAT_ERROR,
]);
const PAGE_HISTORY = new WeakMap<Window, Set<string>>();

export function isContestPracticeRecord(record: any) {
  return !!record?.practiceContest && !record.contest && !Object.hasOwn(record, 'input');
}

export function isContestPracticeResultReady(record: any) {
  return isContestPracticeRecord(record) && FINAL_STATUSES.has(Number(record.status));
}

function recordId(record: any) {
  const value = record?._id;
  if (typeof value === 'string') return value;
  return value?.$oid || value?.toHexString?.() || '';
}

/** Every new practice submission gets its own result, after AC and achievements. */
export function createContestPracticeFeedback(userId: number, win: PracticeWindow = window) {
  const doc = win.document;
  const storageKey = `hydro:contest-practice:shown:${userId}`;
  const shown = PAGE_HISTORY.get(win) || new Set<string>();
  PAGE_HISTORY.set(win, shown);
  try {
    const history = JSON.parse(win.sessionStorage.getItem(storageKey) || '[]');
    if (Array.isArray(history)) history.filter((id) => typeof id === 'string').slice(-500).forEach((id) => shown.add(id));
  } catch { /* Storage can be unavailable; the current page still deduplicates. */ }
  const pending = new Map<string, Promise<void>>();
  let queue = Promise.resolve();
  let generation = 0;
  let disposed = false;
  let closeDisplay: (() => void) | undefined;
  const remember = (id: string) => {
    shown.add(id);
    try { win.sessionStorage.setItem(storageKey, JSON.stringify([...shown].slice(-500))); } catch { /* Best effort. */ }
  };

  function display(record: any) {
    return new Promise<void>((resolve) => {
      if (!doc.body) { resolve(); return; }
      const accepted = Number(record.status) === STATUS.STATUS_ACCEPTED;
      const overlay = doc.createElement('div');
      overlay.className = 'contest-practice-result';
      overlay.dataset.contestPracticeResult = recordId(record);
      overlay.innerHTML = '<section class="contest-practice-result__card" role="dialog" aria-modal="true" '
        + 'aria-labelledby="contest-practice-title" aria-describedby="contest-practice-description" tabindex="-1">'
        + '<div class="contest-practice-result__accent" aria-hidden="true"></div>'
        + '<div class="contest-practice-result__eyebrow"><span></span>赛后练习</div>'
        + '<div class="contest-practice-result__top"><div class="contest-practice-result__symbol" aria-hidden="true">'
        + '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2.4"/>'
        + '<path d="M24 14v10l7 4M33 10l5-3M36 7l2 3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '</div><span class="contest-practice-result__status"></span></div>'
        + '<h2 id="contest-practice-title"></h2>'
        + '<p class="contest-practice-result__message" id="contest-practice-description">比赛已结束，本次结果不计入比赛成绩</p>'
        + '<div class="contest-practice-result__note"><span class="contest-practice-result__check" aria-hidden="true">✓</span>'
        + '<span>本次提交已按普通练习评测</span></div>'
        + '<p class="contest-practice-result__encouragement">练习依然有效，继续挑战下一次进步</p>'
        + '<button type="button" class="contest-practice-result__continue">继续练习<span aria-hidden="true"> →</span></button>'
        + '</section>';
      overlay.classList.toggle('is-accepted', accepted);
      overlay.querySelector('h2')!.textContent = accepted ? '本题 AC，练习也有收获' : '比赛落幕，进步继续';
      overlay.querySelector('.contest-practice-result__status')!.textContent = STATUS_SHORT_TEXTS[Number(record.status)] || '评测完成';
      const button = overlay.querySelector<HTMLButtonElement>('button')!;
      const previousFocus = doc.activeElement as HTMLElement | null;
      const previousOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';
      let closed = false;
      let closeTimer: number | undefined;
      const finish = () => {
        win.clearTimeout(closeTimer);
        overlay.remove();
        doc.body.style.overflow = previousOverflow;
        doc.removeEventListener('keydown', keydown, true);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        closeDisplay = undefined;
        resolve();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.add('is-leaving');
        closeTimer = win.setTimeout(finish, win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
      };
      button.addEventListener('click', close);
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
      doc.addEventListener('keydown', keydown, true);
      closeDisplay = finish;
      doc.body.appendChild(overlay);
      remember(recordId(record));
      button.focus({ preventScroll: true });
    });
  }

  function afterResult(record: any, live: boolean, effectsFinished: Promise<unknown> = Promise.resolve()) {
    const id = recordId(record);
    if (disposed || !live || !id || !isContestPracticeResultReady(record) || Number(record.uid) !== userId || shown.has(id)) {
      return Promise.resolve();
    }
    if (pending.has(id)) return pending.get(id)!;
    const version = generation;
    const result = queue.then(async () => {
      await effectsFinished.catch(() => undefined);
      if (disposed || version !== generation || shown.has(id)) return;
      await display(record);
    });
    queue = result.catch(() => undefined);
    pending.set(id, queue);
    return queue;
  }
  function onPageHide() {
    generation++;
    closeDisplay?.();
    pending.clear();
  }
  function dispose() {
    disposed = true;
    onPageHide();
    win.removeEventListener('pagehide', onPageHide);
  }
  win.addEventListener('pagehide', onPageHide);
  return { afterResult, dispose };
}
