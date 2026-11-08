export interface ProblemChatSnapshot {
  pid: number | string;
  domainId: string;
  code: string;
  lang: string;
  grant?: string;
}

function currentProblem() {
  const context = (window as any).UiContext;
  if (!context || context.ideMode || context.homeworkReview) return null;
  const problem = context.classChat?.problem;
  if (!problem || !problem.domainId || (!problem.pid && problem.pid !== 0)) return null;
  return problem;
}

export function canCaptureProblemSnapshot() { return !!currentProblem(); }

/** Read only the current problem's own editor. Chat drafts and mirrored editors
 * must never become the student's submitted code snapshot. Capture synchronously
 * before the upload begins, so later typing cannot change the sent version. */
export async function captureProblemSnapshot(): Promise<ProblemChatSnapshot | null> {
  const problem = currentProblem();
  if (!problem) return null;
  const context = (window as any).UiContext;
  const user = (window as any).UserContext;
  const state = (window as any).store?.getState?.();
  let code: string | undefined;
  let lang = state?.editor?.lang || context.codeLang || user?.codeLang || '';
  const textarea = document.querySelector<HTMLTextAreaElement>('[name="submit_section"] textarea[name="code"]');
  if (textarea) {
    code = textarea.value;
    lang = document.querySelector<HTMLInputElement>('[name="submit_section"] [name="lang"]')?.value || lang;
  } else {
    const editor = (window as any).editor;
    const node = editor?.getDomNode?.();
    if (node?.isConnected && node.closest('#scratchpad') && !node.closest('[data-live-share-viewer],[data-live-share-private]')) {
      code = editor.getValue({ lineEnding: '\n', preserveBOM: false });
    } else if (typeof state?.editor?.code === 'string' && document.querySelector('#scratchpad')) code = state.editor.code;
    else if (context.pdoc && user?._id) {
      // A learner can send a saved draft from the statement without opening the
      // full editor first. The exact same key is used by the scratchpad reducer.
      let key = `${user._id}/${context.pdoc.domainId}/${context.pdoc.docId}`;
      if (context.tdoc?._id) key += `@${context.tdoc._id}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) code = saved;
        lang = localStorage.getItem(`${key}#lang`) || lang;
      } catch { /* Restricted storage: still send the problem and an empty draft. */ }
    }
  }
  code ??= '';
  if (new TextEncoder().encode(code).byteLength > 128 * 1024) throw new Error('代码超过 128KB，请改用文件发送。');
  return { pid: problem.pid, domainId: problem.domainId, code, lang, ...(problem.grant ? { grant: problem.grant } : {}) };
}
