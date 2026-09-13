import { openDB } from 'vj/utils/db';

/** Copy only the visible submission into this teacher's ordinary problem draft. */
export async function copyHomeworkReviewToOwnDraft() {
  if (UiContext.objectiveMergedReview) throw new Error('合并作答仅供查看，请返回题目后自行作答。');
  const review = UiContext.homeworkReview;
  const pdoc = UiContext.pdoc;
  if (!review?.rid || !UserContext._id) throw new Error('该学员暂无可复制的作答。');
  if (!review.ownAnswerUrl) throw new Error('当前账号没有这道题的独立作答权限。');
  const target = new URL(review.ownAnswerUrl, window.location.href);
  if (target.origin !== window.location.origin || target.searchParams.has('reviewUid') || target.searchParams.has('tid')) {
    throw new Error('作答入口无效，请刷新页面后重试。');
  }
  // Homework review must not write to the student's key or the homework's key.
  const key = `${UserContext._id}/${pdoc.domainId}/${pdoc.docId}`;
  if (pdoc.config?.type === 'objective') {
    const source = UiContext.objectiveInitialSubmission?.answers;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('暂未获取到该学员的答案，请刷新后重试。');
    }
    const answers: Record<string, string | string[]> = {};
    for (const [id, value] of Object.entries(source)) {
      if (!/^\d+(?:-\d+)?$/.test(id)) continue;
      if (typeof value === 'string') answers[id] = value;
      else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) answers[id] = [...value];
    }
    const db = await openDB;
    await db.put('solutions', { id: `${key}#objective`, value: JSON.stringify(answers) });
  } else {
    const previousCode = localStorage.getItem(key);
    const previousLang = localStorage.getItem(`${key}#lang`);
    try {
      localStorage.setItem(`${key}#lang`, review.lang || UiContext.codeLang);
      localStorage.setItem(key, typeof review.code === 'string' ? review.code : '');
    } catch (error) {
      // Keep the previous draft together if saving either part failed.
      for (const [itemKey, value] of [[key, previousCode], [`${key}#lang`, previousLang]]) {
        try {
          if (value === null) localStorage.removeItem(itemKey);
          else localStorage.setItem(itemKey, value);
        } catch { /* Restore the other part even if this key remains unavailable. */ }
      }
      throw error;
    }
    target.searchParams.set('scratchpad', '1');
  }
  return target.toString();
}
