function getCacheKey() {
  let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
  if (UiContext.tdoc?._id) cacheKey += `@${UiContext.tdoc._id}`;
  return cacheKey;
}

function shouldResetScratchpadCode() {
  return Boolean(
    (window as any).__HYDRO_RESET_SCRATCHPAD_CODE__
    && (window as any).__HYDRO_RESET_SCRATCHPAD_KEY__ === getCacheKey(),
  )
    || new URLSearchParams(window.location.search).get('reset_code') === '1';
}

function getInitialState() {
  const cacheKey = getCacheKey();
  const resetScratchpadCode = shouldResetScratchpadCode();
  return {
    lang: localStorage.getItem(`${cacheKey}#lang`) || UiContext.codeLang,
    code: resetScratchpadCode ? '' : (localStorage.getItem(cacheKey) || UiContext.codeTemplate),
  };
}

// TODO switch to indexeddb
export default function reducer(state = getInitialState(), action: any = {}) {
  const cacheKey = getCacheKey();
  const resetScratchpadCode = shouldResetScratchpadCode();
  if (action.type === 'SCRATCHPAD_EDITOR_UPDATE_CODE') {
    if (!resetScratchpadCode) localStorage.setItem(cacheKey, action.payload);
    return {
      ...state,
      code: action.payload,
    };
  }
  if (action.type === 'SCRATCHPAD_EDITOR_SET_LANG') {
    if (!resetScratchpadCode) localStorage.setItem(`${cacheKey}#lang`, action.payload);
    return {
      ...state,
      lang: action.payload,
    };
  }
  return state;
}
