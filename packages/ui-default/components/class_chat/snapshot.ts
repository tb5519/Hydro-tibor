export interface ProblemChatSnapshot {
  pid: number | string;
  domainId: string;
  code: string;
  lang: string;
  grant?: string;
  tid?: string;
}

/** Persistent communication controls live above the current application page.
 * Resolve the live document at click time: holding an old frame/document here
 * could send the previous question after the learner has navigated elsewhere. */
function currentPage(): Window | null {
  try {
    const shell = (window as any).__onebyonePlatformShell;
    const page: Window | null = shell ? shell.contentWindow() : window;
    if (!page || page.location.origin !== window.location.origin) return null;
    const owner = (window as any).UserContext?._id;
    if (owner && (page as any).UserContext?._id !== owner) return null;
    return page;
  } catch { return null; }
}

function currentProblem(page = currentPage()) {
  const context = (page as any)?.UiContext;
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
  const page = currentPage();
  const problem = currentProblem(page);
  if (!problem) return null;
  const doc = page!.document;
  const context = (page as any).UiContext;
  const user = (page as any).UserContext;
  const state = (page as any).store?.getState?.();
  let code: string | undefined;
  let lang = state?.editor?.lang || context.codeLang || user?.codeLang || '';
  const textarea = doc.querySelector<HTMLTextAreaElement>('[name="submit_section"] textarea[name="code"]');
  if (textarea) {
    code = textarea.value;
    lang = doc.querySelector<HTMLInputElement>('[name="submit_section"] [name="lang"]')?.value || lang;
  } else {
    const editor = (page as any).editor;
    const node = editor?.getDomNode?.();
    if (node?.isConnected && node.closest('#scratchpad') && !node.closest('[data-live-share-viewer],[data-live-share-private]')) {
      code = editor.getValue({ lineEnding: '\n', preserveBOM: false });
    } else if (typeof state?.editor?.code === 'string' && doc.querySelector('#scratchpad')) code = state.editor.code;
    else if (context.pdoc && user?._id) {
      // A learner can send a saved draft from the statement without opening the
      // full editor first. The exact same key is used by the scratchpad reducer.
      let key = `${user._id}/${context.pdoc.domainId}/${context.pdoc.docId}`;
      if (context.tdoc?._id) key += `@${context.tdoc._id}`;
      try {
        const saved = page!.localStorage.getItem(key);
        if (saved !== null) code = saved;
        lang = page!.localStorage.getItem(`${key}#lang`) || lang;
      } catch { /* Restricted storage: still send the problem and an empty draft. */ }
    }
  }
  code ??= '';
  if (new TextEncoder().encode(code).byteLength > 128 * 1024) throw new Error('代码超过 128KB，请改用文件发送。');
  const tid = typeof context.tdoc?._id === 'string' && /^[a-f\d]{24}$/i.test(context.tdoc._id) ? context.tdoc._id : undefined;
  return { pid: problem.pid, domainId: problem.domainId, code, lang,
    ...(problem.grant ? { grant: problem.grant } : {}), ...(tid ? { tid } : {}) };
}
