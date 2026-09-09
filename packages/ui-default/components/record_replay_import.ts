import { openDB } from 'vj/utils/db';

function replayKey() {
  const replay = UiContext.recordReplay;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('draftImport');
  if (!replay || !UserContext._id || UiContext.homeworkReview || UiContext.tdoc
    || url.searchParams.get('fromRecord') !== replay.rid
    || !token || !/^[\w-]{16,80}$/.test(token)) return null;
  return `hydro:record-import:${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}/${token}`;
}

/** A selection replaces only the teacher's draft, once; reloading preserves edits. */
export async function prepareRecordReplayDraft() {
  if (!UiContext.recordReplay) return;
  const markerKey = replayKey();
  if (!markerKey) throw new Error('请选择一条提交记录后再填入作答。');
  const replay = UiContext.recordReplay;
  const existing = sessionStorage.getItem(markerKey);
  let marker = existing ? JSON.parse(existing) : null;
  if (marker && marker.rid !== replay.rid) throw new Error('记录选择已失效，请重新选择。');
  if (!marker) {
    const key = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
    // Reserve the token first. If storage is disabled, the existing draft is untouched.
    marker = { rid: replay.rid };
    sessionStorage.setItem(markerKey, JSON.stringify(marker));
    try {
      if (UiContext.pdoc.config?.type === 'objective') {
        const source = replay.objective?.answers;
        if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('该记录没有可填入的答案。');
        const answers = Object.fromEntries(Object.entries(source).filter(([id, value]) => /^\d+(?:-\d+)?$/.test(id)
          && (typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string')))));
        const db = await openDB;
        await db.put('solutions', { id: `${key}#objective`, value: JSON.stringify(answers) });
      } else {
        if (typeof replay.code !== 'string') throw new Error('该记录没有可填入的代码。');
        const oldCode = localStorage.getItem(key);
        const oldLang = localStorage.getItem(`${key}#lang`);
        try {
          localStorage.setItem(`${key}#lang`, replay.lang || UiContext.codeLang);
          localStorage.setItem(key, replay.code);
        } catch (error) {
          for (const [itemKey, value] of [[key, oldCode], [`${key}#lang`, oldLang]]) {
            try {
              if (value === null) localStorage.removeItem(itemKey);
              else localStorage.setItem(itemKey, value);
            } catch { /* Try restoring both keys independently. */ }
          }
          throw error;
        }
      }
    } catch (error) {
      sessionStorage.removeItem(markerKey);
      throw error;
    }
  }
  UiContext.recordReplayResultActive = !marker.ownSubmission;
  if (replay.objective) UiContext.objectiveInitialSubmission = marker.ownSubmission || replay.objective;
}

/** Keep a teacher's new grade when refreshing the imported-answer page. */
export function rememberRecordReplaySubmission(answers, feedback) {
  if (!UiContext.recordReplay || !feedback) return;
  UiContext.recordReplayResultActive = false;
  UiContext.objectiveInitialSubmission = { answers, feedback };
  try {
    const key = replayKey();
    if (key) sessionStorage.setItem(key, JSON.stringify({ rid: UiContext.recordReplay.rid, ownSubmission: { answers, feedback } }));
  } catch { /* Saving the local preview must never turn a successful submission into an error. */ }
}
