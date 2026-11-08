/** A single, same-origin communication document outlives application pages.
 * Pages retain their normal browser lifecycle (including unsaved-work guards),
 * while sockets/media/drafts belong to the host rather than the replaced page. */
export interface PlatformShell {
  contentWindow(): Window | null;
  navigate(url: string, options?: { replace?: boolean }): void;
  pageReady(page: Window): void;
  pageLoading(page: Window): void;
  dispose(): void;
}

type PlatformWindow = Window & Pick<typeof globalThis, 'HTMLElement' | 'CustomEvent' | 'HTMLFormElement' | 'MutationObserver'> & {
  UiContext?: any; UserContext?: any;
  __onebyonePlatformShell?: PlatformShell;
  __onebyonePlatformAttached?: boolean;
};

function sameOriginUrl(value: string, win: Window) {
  try {
    const url = new URL(value, win.location.href);
    return url.origin === win.location.origin && /^https?:$/.test(url.protocol) ? url : null;
  } catch { return null; }
}

function identity(win: PlatformWindow) {
  const user = win.UserContext;
  return user && typeof user === 'object' ? Number(user._id ?? user.uid ?? 0) : null;
}

function parentShell(win: Window): PlatformShell | null {
  try {
    if (win.parent === win || win.parent.location.origin !== win.location.origin) return null;
    const shell = (win.parent as PlatformWindow).__onebyonePlatformShell;
    return shell?.contentWindow() === win ? shell : null;
  } catch { return null; }
}

function isDownload(url: URL) {
  return /\.(?:zip|sb3|sprite3|pdf|png|jpe?g|gif|webp|svg|mp[34]|wav|ogg|webm|txt|cpp|py|csv|xlsx?|docx?|pptx?)(?:$)/i.test(url.pathname)
    || /(?:\/file\/|\/attachment\/|\/export(?:\/|$)|\/download(?:\/|$))/.test(url.pathname);
}

export function installPlatformShell(win: Window = window): PlatformShell | null {
  const host = win as PlatformWindow;
  if (win.top !== win || win.document.documentElement.dataset.app !== 'Hydro' || identity(host) === null) return null;
  if (host.__onebyonePlatformShell) return host.__onebyonePlatformShell;
  const doc = win.document;
  const uid = identity(host);
  let disposed = false;
  let currentDocument: Document | null = null;
  let identityChanged = false;
  let loadingTimer = 0;
  const cleanups: (() => void)[] = [];
  const style = doc.createElement('style');
  style.textContent = `html.platform-shell,html.platform-shell body{margin:0!important;width:100%;height:100%;overflow:hidden!important}
    .platform-page{position:fixed;inset:0;width:100%;height:100%;border:0;background:#edf0f2;z-index:0;color-scheme:normal}
    .platform-initial-preview{pointer-events:none;position:fixed;inset:0;overflow:hidden}
    .platform-navigation-progress{position:fixed;left:0;top:0;width:100%;height:2px;z-index:2147483600;background:linear-gradient(90deg,#3684e9,#66b9d3);pointer-events:none}
    .platform-navigation-error{position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483601;background:white;color:#33465b;border:1px solid #d9e3eb;border-radius:12px;padding:12px 18px;box-shadow:0 6px 24px #23354c15;font:14px/1.5 sans-serif}
    .platform-navigation-error button{margin-left:12px;border:0;background:#e9f1fb;color:#2861a6;border-radius:8px;padding:6px 10px;cursor:pointer}
    .platform-navigation-progress[hidden],.platform-navigation-error[hidden]{display:none!important}`;
  doc.head.append(style);
  const preview = doc.createElement('div');
  preview.className = 'platform-initial-preview'; preview.setAttribute('aria-hidden', 'true');
  // Keep a first-paint preview until the real application document is ready.
  for (const node of Array.from(doc.body.childNodes)) {
    if (node instanceof host.HTMLElement && node.matches('[data-teacher-assistant]')) continue;
    preview.append(node);
  }
  doc.body.append(preview);
  doc.documentElement.classList.add('platform-shell');
  const frame = doc.createElement('iframe');
  frame.className = 'platform-page'; frame.dataset.platformPage = '';
  frame.name = 'onebyone-platform-page'; frame.title = 'OneByOne 页面';
  frame.allow = 'microphone; camera; autoplay; fullscreen; clipboard-read; clipboard-write';
  frame.allowFullscreen = true;
  frame.style.visibility = 'hidden';
  const progress = doc.createElement('div');
  progress.className = 'platform-navigation-progress'; progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '正在打开页面');
  const error = doc.createElement('div'); error.className = 'platform-navigation-error'; error.hidden = true;
  error.setAttribute('role', 'status');
  const errorText = doc.createElement('span'); errorText.textContent = '页面暂时未能打开，课堂连接仍在保持。';
  const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重新打开';
  error.append(errorText, retry);
  const emit = (name: string, detail?: any) => win.dispatchEvent(new host.CustomEvent(name, { detail }));
  const listen = (target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options));
  };
  function loading() {
    progress.hidden = false; error.hidden = true;
    win.clearTimeout(loadingTimer);
    loadingTimer = win.setTimeout(() => { progress.hidden = true; error.hidden = false; }, 20000);
  }
  function showPage() {
    frame.style.visibility = 'visible'; preview.remove();
    progress.hidden = true; error.hidden = true; win.clearTimeout(loadingTimer);
  }
  const shell: PlatformShell = {
    contentWindow: () => frame.contentWindow,
    navigate(value, options = {}) {
      if (disposed) return;
      const url = sameOriginUrl(value, win);
      if (!url) { win.open(value, '_blank', 'noopener'); return; }
      const page = frame.contentWindow;
      if (!page) return;
      // Native navigation preserves beforeunload cancellation and POST semantics.
      if (options.replace) page.location.replace(url.href);
      else page.location.assign(url.href);
    },
    pageLoading(page) {
      if (disposed || page !== frame.contentWindow) return;
      currentDocument = null;
      emit('onebyone:page-loading', { window: page }); loading();
    },
    pageReady(page) {
      if (disposed || page !== frame.contentWindow) return;
      try {
        if (page.location.origin !== win.location.origin || page.location.href === 'about:blank') return;
        const nextUid = identity(page as PlatformWindow);
        if (nextUid !== null && nextUid !== uid) {
          if (identityChanged) return;
          identityChanged = true;
          emit('onebyone:session-ended');
          // Login/logout/impersonation are security boundaries, never reuse media.
          win.location.replace(page.location.href); return;
        }
        showPage();
        const url = page.location.href;
        if (win.location.href !== url) win.history.replaceState(win.history.state, '', url);
        doc.title = page.document.title || doc.title;
        const isNewDocument = currentDocument !== page.document;
        if (isNewDocument) {
          for (const cls of Array.from(doc.documentElement.classList)) {
            if (cls.startsWith('theme--')) doc.documentElement.classList.remove(cls);
          }
          for (const cls of Array.from(page.document.documentElement.classList)) {
            if (cls.startsWith('theme--')) doc.documentElement.classList.add(cls);
          }
          doc.documentElement.lang = page.document.documentElement.lang;
          doc.documentElement.dataset.mantineColorScheme = page.document.documentElement.dataset.mantineColorScheme || 'light';
          const fonts = page.getComputedStyle(page.document.body);
          for (const name of ['--font-family', '--code-font-family', '--font-ligatures']) {
            doc.body.style.setProperty(name, fonts.getPropertyValue(name));
          }
        }
        currentDocument = page.document;
        emit('onebyone:page-change', { window: page, context: (page as PlatformWindow).UiContext,
          url, title: page.document.title, isNewDocument });
      } catch { progress.hidden = true; error.hidden = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; win.clearTimeout(loadingTimer); cleanups.forEach(remove => remove());
      if (host.__onebyonePlatformShell === shell) delete host.__onebyonePlatformShell;
    },
  };
  host.__onebyonePlatformShell = shell;
  listen(retry, 'click', () => {
    try { frame.contentWindow?.location.reload(); loading(); } catch { frame.src = win.location.href; loading(); }
  });
  listen(frame, 'load', () => {
    const page = frame.contentWindow;
    if (page) shell.pageReady(page);
  });
  // Assistant/chat links live in the host but should open inside the application.
  listen(doc, 'click', ((event: MouseEvent) => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement;
    if (!anchor || anchor.hasAttribute('download')) return;
    const url = sameOriginUrl(anchor.href, win);
    if (!url || isDownload(url)) return;
    event.preventDefault(); shell.navigate(url.href);
  }) as EventListener);
  listen(win, 'pagehide', ((event: PageTransitionEvent) => {
    if (!event.persisted) { emit('onebyone:session-ended'); shell.dispose(); }
  }) as EventListener);
  frame.src = win.location.href;
  doc.body.append(frame, progress, error); loading();
  return shell;
}

/** Attach before page modules so normal links/forms and window.open share one host. */
export function attachPlatformPage(win: Window = window) {
  const shell = parentShell(win);
  const page = win as PlatformWindow;
  if (!shell) return false;
  if (page.__onebyonePlatformAttached) return true;
  page.__onebyonePlatformAttached = true;
  const doc = win.document;
  const sync = () => shell.pageReady(win);
  const gesture = (event: Event) => {
    if (!event.isTrusted) return;
    win.parent.dispatchEvent(new (win.parent as PlatformWindow).CustomEvent('onebyone:platform-gesture'));
  };
  doc.addEventListener('pointerdown', gesture, true);
  doc.addEventListener('keydown', gesture, true);
  doc.addEventListener('click', (event: MouseEvent) => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement;
    if (!anchor || anchor.hasAttribute('download')) return;
    const url = sameOriginUrl(anchor.href, win);
    if (url && !isDownload(url)) anchor.target = '_self';
    else if (!url && /^https?:/.test(anchor.href)) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  }, true);
  doc.addEventListener('submit', (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement;
    const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null;
    const action = submitter?.getAttribute('formaction') || form.action;
    if (sameOriginUrl(action, win)) {
      form.target = '_self';
      if (submitter?.hasAttribute('formtarget')) submitter.setAttribute('formtarget', '_self');
    }
  }, true);
  // Native form.submit() bypasses submit events; preserve its method/body/validation semantics.
  const nativeSubmit = page.HTMLFormElement.prototype.submit;
  page.HTMLFormElement.prototype.submit = function submit() {
    if (sameOriginUrl(this.action, win)) this.target = '_self';
    return nativeSubmit.call(this);
  };
  const nativeOpen = win.open.bind(win);
  win.open = ((value?: string | URL, target?: string, features?: string) => {
    if (value) {
      const url = sameOriginUrl(String(value), win);
      if (url && !isDownload(url)) { win.location.assign(url.href); return win; }
    }
    // Blank print windows, downloads, and external resources retain their behavior.
    return nativeOpen(value, target, features);
  }) as typeof win.open;
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = win.history[name].bind(win.history);
    win.history[name] = (...args: Parameters<History[typeof name]>) => { original(...args); sync(); };
  }
  win.addEventListener('popstate', sync);
  win.addEventListener('hashchange', sync);
  win.addEventListener('pageshow', sync);
  win.addEventListener('pagehide', () => shell.pageLoading(win));
  const observer = new page.MutationObserver(() => {
    try { if (win.parent.document.title !== doc.title) sync(); } catch { /* A stale document cannot change the shell. */ }
  });
  if (doc.head) observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  return true;
}

export function notifyPlatformPageReady(win: Window = window) {
  parentShell(win)?.pageReady(win);
}
