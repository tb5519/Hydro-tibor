function getCacheKey() {
  let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
  if (UiContext.tdoc?._id) cacheKey += `@${UiContext.tdoc._id}`;
  return cacheKey;
}

function isCppLanguage(lang: string) {
  const language = window.LANGS?.[lang];
  return language?.monaco === 'cpp'
    || language?.highlight === 'cpp'
    || lang === 'cc'
    || lang.startsWith('cc.');
}

function getCppEditorMode() {
  const mode = UiContext.cppEditorMode;
  if (mode === 'beginner' || mode === 'preset' || mode === 'proficient') return mode;
  // Compatibility for students whose setting predates the three-mode control.
  return UiContext.cppStarterTemplate ? 'preset' : 'proficient';
}

function getCppStarterTemplate(lang: string) {
  return getCppEditorMode() === 'preset'
    && isCppLanguage(lang) && typeof UiContext.cppStarterTemplate === 'string'
    ? UiContext.cppStarterTemplate
    : '';
}

function getInitialCode(lang: string) {
  // C++ beginner and proficient modes must start with the learner's own code
  // only. In particular, do not fall back to the account-level code template.
  if (isCppLanguage(lang)) return getCppStarterTemplate(lang);
  return UiContext.codeTemplate || '';
}

function getInitialState() {
  const cacheKey = getCacheKey();
  const lang = localStorage.getItem(`${cacheKey}#lang`) || UiContext.codeLang;
  const cachedCode = localStorage.getItem(cacheKey);
  return {
    lang,
    // An existing draft (including an intentionally empty draft) always wins
    // over a starter template. This prevents a language switch from replacing
    // work the student has already saved in the browser.
    code: cachedCode !== null ? cachedCode : getInitialCode(lang),
  };
}

// TODO switch to indexeddb
export default function reducer(state = getInitialState(), action: any = {}) {
  const cacheKey = getCacheKey();
  if (action.type === 'SCRATCHPAD_EDITOR_UPDATE_CODE') {
    localStorage.setItem(cacheKey, action.payload);
    return {
      ...state,
      code: action.payload,
    };
  }
  if (action.type === 'SCRATCHPAD_EDITOR_SET_LANG') {
    localStorage.setItem(`${cacheKey}#lang`, action.payload);
    const cppStarterTemplate = getCppStarterTemplate(action.payload);
    const hasSavedDraft = localStorage.getItem(cacheKey) !== null;
    const shouldSeedCppStarter = !!cppStarterTemplate
      && !hasSavedDraft
      && !state.code;
    // A just-opened editor can still contain the generic profile template from
    // a previously selected non-C++ language. It is not a student draft, so
    // clear it when entering a non-preset C++ mode.
    const shouldClearCppDefault = isCppLanguage(action.payload)
      && getCppEditorMode() !== 'preset'
      && !hasSavedDraft
      && state.code === (UiContext.codeTemplate || '');
    if (shouldSeedCppStarter) localStorage.setItem(cacheKey, cppStarterTemplate);
    return {
      ...state,
      lang: action.payload,
      code: shouldSeedCppStarter ? cppStarterTemplate : (shouldClearCppDefault ? '' : state.code),
    };
  }
  return state;
}
