/** A daily-practice redirect must preserve pasted code in the ordinary submit form. */
export function bindDailyQuizSubmitDraft(form: HTMLFormElement, uid: number, win: Window = window) {
  if (!form || !Number.isSafeInteger(uid) || uid <= 1 || form.dataset.dailyQuizDraftBound) return;
  const code = form.querySelector<HTMLTextAreaElement>('textarea[name="code"]');
  if (!code) return;
  form.dataset.dailyQuizDraftBound = 'true';
  const key = `hydro:daily-quiz:submit-draft:${uid}:${win.location.pathname}${win.location.search}`;
  const language = () => form.querySelector<HTMLInputElement | HTMLSelectElement>('[name="lang"]');
  try {
    const saved = JSON.parse(win.sessionStorage.getItem(key) || 'null');
    if (saved && typeof saved.code === 'string' && !code.value) {
      code.value = saved.code;
      const lang = language();
      if (lang && typeof saved.lang === 'string' && (lang.tagName !== 'SELECT'
        || Array.from((lang as HTMLSelectElement).options).some((option) => option.value === saved.lang))) {
        lang.value = saved.lang;
      }
    }
  } catch { /* The empty form remains usable when no valid draft is available. */ }
  const save = () => {
    win.sessionStorage.setItem(key, JSON.stringify({ code: code.value, lang: language()?.value || '' }));
  };
  const redirect = (event: Event) => {
    if (!form.isConnected) return;
    // Browsers cannot restore selected files after navigation. Keep this tab so
    // the learner can finish daily practice in the offered second tab instead.
    if (Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]')).some((input) => input.files?.length)) {
      event.preventDefault();
      return;
    }
    try { save(); } catch { event.preventDefault(); }
  };
  win.addEventListener('hydro:daily-quiz-redirect', redirect);
  const submit = () => { try { save(); } catch { /* A normal submission still works without local storage. */ } };
  form.addEventListener('submit', submit, true);
  return () => {
    win.removeEventListener('hydro:daily-quiz-redirect', redirect);
    form.removeEventListener('submit', submit, true);
    delete form.dataset.dailyQuizDraftBound;
  };
}
