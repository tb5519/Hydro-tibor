(() => {
  'use strict';
  const root = document.querySelector('[data-scratch-public-player]');
  const frame = document.querySelector('[data-scratch-player-frame]');
  const status = document.querySelector('[data-scratch-player-status]');
  const message = document.querySelector('[data-scratch-player-message]');
  const retry = document.querySelector('[data-scratch-player-retry]');
  if (!root || !frame || !status || !message || !retry) return;
  const channel = crypto.randomUUID();
  const controller = new AbortController();
  let config;
  let memberOnly = false;
  try { config = JSON.parse(root.dataset.config); memberOnly = config?.memberOnly === true; } catch { /* Report malformed config when the frame is ready. */ }
  let stopped = false;
  let initialized = false;
  let sentProject = false;
  let loaded = false;
  let runtime = null;
  let sharedState = null;
  const fail = (text) => {
    runtime?.stop();
    sharedState?.stop(true);
    clearTimeout(timer);
    controller.abort();
    stopped = true;
    frame.remove();
    message.textContent = text;
    status.hidden = false;
    status.dataset.error = 'true';
    retry.hidden = false;
  };
  const timer = setTimeout(() => fail('作品加载有点慢，请检查网络后重新打开。'), memberOnly ? 300000 : 120000);
  retry.addEventListener('click', () => location.reload());
  // Only the authenticated parent owns metrics. A sandbox receives neither
  // session IDs nor endpoint URLs, and loading/idle/hidden time earns no credit.
  const createRuntimeTracker = () => {
    if (!memberOnly || typeof config?.metricsUrl !== 'string') return null;
    let endpoint;
    try { endpoint = new URL(config.metricsUrl, location.href); } catch { return null; }
    if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) return null;
    let running = false;
    let ended = false;
    let current = null;
    let previousDone = Promise.resolve();
    const now = () => performance.now();
    const IDLE_MS = 60000;
    let lastActivity = null;
    let idleTimer = null;
    const hint = document.querySelector('[data-community-runtime-hint]');
    const recentActivity = () => lastActivity !== null && now() < lastActivity + IDLE_MS;
    const wanted = () => loaded && running && !ended && !document.hidden && recentActivity();
    const updateHint = () => {
      if (!hint) return;
      const text = ended || !running ? '作品停止时暂停计时' : document.hidden ? '页面在后台，计时已暂停' :
        recentActivity() ? '正在计时 · 60 秒无操作后暂停' : '已暂停计时 · 操作作品后继续';
      if (hint.textContent !== text) hint.textContent = text;
    };
    const announce = (summary) => window.dispatchEvent(new CustomEvent('scratch-community-metrics', { detail: summary }));
    const post = async (body) => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 10000);
      try {
        const response = await fetch(endpoint.href, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams(body), signal: abort.signal, keepalive: true,
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error('Metrics temporarily unavailable');
        announce(result);
        return result;
      } finally { clearTimeout(timeout); }
    };
    const accrue = (session) => {
      if (session.lastTick === null || session.closed) return;
      const time = Math.min(now(), lastActivity + IDLE_MS);
      // A sleeping computer or heavily delayed timer is not an hour of play.
      session.milliseconds += Math.max(0, Math.min(time - session.lastTick, 15000));
      session.lastTick = time;
    };
    const finish = (session) => {
      if (session.finished) return;
      session.finished = true;
      session.done();
    };
    const flush = async (session) => {
      if (!session.id || session.sending || session.finished) return;
      session.sending = true;
      try {
        do {
          if (!session.pending) {
            const seconds = Math.min(30, Math.floor(session.milliseconds / 1000));
            if (!seconds) break;
            session.milliseconds -= seconds * 1000;
            session.pending = { operation: 'runtimeHeartbeat', sessionId: session.id, seq: ++session.seq, seconds };
          }
          // On a lost response retry this exact sequence and duration. The
          // server makes that request idempotent even if it already committed.
          const result = await post(session.pending);
          session.pending = null;
          if (result.sessionExpired) {
            session.closed = true;
            if (current === session) current = null;
            break;
          }
        } while (session.closed && session.milliseconds >= 1000);
      } catch { /* Playback continues; retry a pending heartbeat on the next tick. */ }
      finally {
        session.sending = false;
        if (session.closed) finish(session);
      }
    };
    const sync = () => {
      updateHint();
      if (!wanted()) {
        if (current) {
          const session = current;
          current = null;
          accrue(session);
          session.closed = true;
          void flush(session);
        }
        return;
      }
      if (current) return;
      const session = { id: null, requestId: crypto.randomUUID(), closed: false, finished: false,
        lastTick: null, milliseconds: 0, seq: 0, pending: null, sending: false, done: null };
      current = session;
      const preceding = previousDone;
      previousDone = new Promise((resolve) => { session.done = resolve; });
      void (async () => {
        // Finish the previous visible run before rotating its server session.
        // This also prevents a slow start response from reviving a stopped run.
        await preceding;
        if (session.closed) { finish(session); return; }
        try {
          const result = await post({ operation: 'runtimeStart', requestId: session.requestId });
          if (typeof result.sessionId !== 'string' || !result.sessionId) throw new Error('Invalid runtime session');
          session.id = result.sessionId;
          // A delayed start cannot revive a run whose activity window expired.
          if (session.closed || !wanted()) {
            session.closed = true;
            if (current === session) current = null;
            finish(session);
            return;
          }
          session.lastTick = now();
        } catch {
          session.closed = true;
          if (current === session) current = null;
          finish(session);
        }
      })();
    };
    const armIdleTimer = () => {
      if (ended || idleTimer !== null || lastActivity === null) return;
      idleTimer = setTimeout(() => {
        idleTimer = null;
        sync();
        // Input may have moved the deadline without rescheduling on every
        // mouse movement. Recheck the current deadline before closing a run.
        if (recentActivity()) armIdleTimer();
      }, Math.max(0, lastActivity + IDLE_MS - now()));
    };
    const activity = () => {
      if (!loaded || ended || document.hidden) return;
      // Expire against the OLD deadline first: a late event must never credit
      // the idle gap, even if the browser delayed its inactivity timer.
      sync();
      lastActivity = now();
      armIdleTimer();
      sync();
    };
    const inputTypes = ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup',
      'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel'];
    const onInput = (event) => { if (event.isTrusted) activity(); };
    for (const type of inputTypes) document.addEventListener(type, onInput, { capture: true, passive: true });
    const heartbeat = setInterval(() => {
      sync();
      if (current) { accrue(current); void flush(current); }
    }, 15000);
    document.addEventListener('visibilitychange', sync);
    return {
      loaded() {
        if (lastActivity !== null || ended) return;
        lastActivity = now();
        armIdleTimer();
        sync();
      },
      activity,
      setRunning(value) { running = value; sync(); },
      stop() {
        ended = true;
        clearInterval(heartbeat);
        clearTimeout(idleTimer);
        idleTimer = null;
        document.removeEventListener('visibilitychange', sync);
        for (const type of inputTypes) document.removeEventListener(type, onInput, { capture: true });
        sync();
      },
    };
  };
  runtime = createRuntimeTracker();
  const createSharedState = () => {
    if (!memberOnly || typeof config?.stateUrl !== 'string') return null;
    const endpoint = new URL(config.stateUrl, location.href);
    if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('作品数据地址无效。');
    const label = document.querySelector('[data-community-state-status]');
    const clientId = crypto.randomUUID();
    let sequence = 0;
    let pending = null;
    let retryTimer = null;
    let ending = false;
    let blocked = false;
    let localError = false;
    let localErrorGeneration = 0;
    const show = (text, error = false) => {
      if (label) { label.textContent = text; label.dataset.error = String(error); }
    };
    const request = async (body) => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 12000);
      try {
        const response = await fetch(endpoint.href, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          ...(body ? { body, keepalive: new Blob([body.toString()]).size < 60000 } : {}), signal: abort.signal });
        const result = await response.json();
        if (!response.ok || !result.ok || result.fileId !== config.stateFileId ||
            !Number.isSafeInteger(result.revision) || !Array.isArray(result.values)) {
          const error = new Error('作品数据暂时无法读取。请返回社区重新打开，避免覆盖已有数据。');
          error.permanent = [400, 403, 404, 409].includes(response.status) ||
            (response.ok && result.ok && result.fileId !== config.stateFileId);
          throw error;
        }
        return result;
      } finally { clearTimeout(timeout); }
    };
    const send = async () => {
      if (!pending || pending.sending || blocked) return;
      const current = pending;
      current.sending = true;
      if (current.body && !localError) show('正在保存课堂共享数据…');
      try {
        const result = await request(current.body);
        if (pending !== current) return;
        pending = null;
        if (current.body && current.errorGeneration === localErrorGeneration) localError = false;
        if (!localError) show('课堂共享数据已同步');
        if (!blocked && frame.isConnected) frame.contentWindow.postMessage({ channel, type: 'communityStateSaved', id: current.id,
          revision: result.revision, values: result.values }, '*');
      } catch (error) {
        if (error.permanent) {
          blocked = true;
          if (!localError) show('共享数据未保存，请返回社区重新打开作品。', true);
        } else {
          if (!localError) show('连接暂时中断，共享数据正在重试保存…', true);
          if (!ending) retryTimer = setTimeout(() => { retryTimer = null; void send(); }, 3000);
        }
      } finally { current.sending = false; }
    };
    const flushFrame = () => {
      if (!loaded || ending || blocked || stopped) return;
      frame.contentWindow.postMessage({ channel, type: 'flushCommunityState' }, '*');
    };
    const onVisibility = () => { if (document.hidden) flushFrame(); };
    document.addEventListener('visibilitychange', onVisibility);
    return {
      flushFrame,
      reportError() {
        if (blocked) return;
        localError = true;
        localErrorGeneration++;
        show('作品运行数据超出保存限制，本次变化尚未保存。', true);
      },
      async load() {
        const state = await request();
        show('课堂共享数据已同步');
        return { revision: state.revision, values: state.values };
      },
      receive(data) {
        if (blocked || pending || !Number.isSafeInteger(data.id) || data.id < 1 ||
            !Number.isSafeInteger(data.baseRevision) || data.baseRevision < 0 || !Array.isArray(data.changes)) return;
        const changes = JSON.stringify(data.changes);
        if (data.changes.length > 1000 || new Blob([changes]).size > 512 * 1024) {
          blocked = true;
          show('共享数据过大，本次更改未保存，请老师检查作品。', true);
          return;
        }
        pending = { id: data.id, sending: false, errorGeneration: localErrorGeneration, body: data.changes.length ? new URLSearchParams({ operation: 'sync',
          requestId: crypto.randomUUID(), clientId, seq: ++sequence, fileId: config.stateFileId,
          baseRevision: data.baseRevision, changes }) : null };
        void send();
      },
      stop(disable = false) {
        ending = true;
        blocked = blocked || disable;
        clearTimeout(retryTimer);
        document.removeEventListener('visibilitychange', onVisibility);
        void send();
      },
    };
  };
  let pendingState;
  try {
    sharedState = createSharedState();
    if (sharedState) pendingState = sharedState.load().catch((error) => { if (!stopped) fail(error.message); return null; });
  } catch (error) { fail(error.message); }
  const downloadProject = async () => {
    const config = JSON.parse(root.dataset.config);
    const url = new URL(config.projectUrl, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('分享地址无效。');
    // The application authorizes the initial URL before issuing its existing
    // signed CDN redirect. same-origin credentials never accompany a CDN hop.
    const response = await fetch(url.href, {
      credentials: memberOnly ? 'same-origin' : 'omit', signal: controller.signal, referrerPolicy: 'no-referrer',
      ...(memberOnly ? { cache: 'no-cache' } : {}),
    });
    const contentType = response.headers?.get('content-type') || '';
    if (!response.ok || (memberOnly && /^(?:text\/html|application\/json)/i.test(contentType))) throw new Error(memberOnly
      ? '作品暂时无法访问，请返回当前课堂的创作社区后重新打开。'
      : '分享已关闭或无法访问，请向作者获取新的链接。');
    const maxSize = Math.min(Number(config.maxFileSize) || 0, 20 * 1024 * 1024);
    if (+response.headers.get('content-length') > maxSize) throw new Error('作品文件过大，暂时无法播放。');
    const blob = await response.blob();
    if (blob.size > maxSize) throw new Error('作品文件过大，暂时无法播放。');
    const project = await blob.arrayBuffer();
    if (memberOnly && !stopped && !initialized) message.textContent = '作品已读取，正在准备播放器…';
    return { project, title: config.title };
  };
  let pendingProject;
  window.addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    try {
      // The iframe's pagehide/visibility flush arrives asynchronously. Accept
      // that final trusted state after our own pagehide, using keepalive; every
      // other late message still stops at the page lifecycle boundary.
      if (event.data.type === 'communityStateSync' && loaded) {
        sharedState?.receive(event.data);
        return;
      }
      if (event.data.type === 'communityStateError' && loaded) {
        sharedState?.reportError();
        return;
      }
      if (stopped) return;
      if (event.data.type === 'ready' && !initialized) {
        initialized = true;
        if (memberOnly) message.textContent = '正在读取作品，请稍等…';
        const result = await (pendingProject || downloadProject());
        const state = pendingState ? await pendingState : null;
        if (stopped || !result) return;
        frame.contentWindow.postMessage({ channel, type: 'init', mode: 'player', readOnly: true,
          title: result.title, project: result.project, ...(state ? {communityState: state} : {}) }, '*', [result.project]);
        sentProject = true;
        if (memberOnly) message.textContent = '作品已读取，正在准备舞台…';
      } else if (event.data.type === 'loaded' && sentProject && !loaded) {
        loaded = true;
        runtime?.loaded();
        clearTimeout(timer);
        status.hidden = true;
      } else if (event.data.type === 'runState' && loaded && typeof event.data.running === 'boolean') {
        runtime?.setRunning(event.data.running);
      } else if (event.data.type === 'userActivity' && loaded) {
        runtime?.activity();
      } else if (event.data.type === 'error') {
        throw new Error(loaded ? '作品暂时无法运行，请重新打开。' : '这个作品暂时无法打开，请稍后重试。');
      }
    } catch (error) {
      if (!stopped) fail(error.name === 'AbortError' ? '作品加载已停止，请重新打开。' : error.message);
    }
  });
  window.addEventListener('pagehide', () => {
    sharedState?.flushFrame();
    runtime?.stop();
    sharedState?.stop();
    stopped = true;
    controller.abort();
    clearTimeout(timer);
  }, { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  // v must be first so older site service workers bypass their entry cache.
  frame.src = `/scratch-editor/editor.html?v=${encodeURIComponent(root.dataset.editorVersion || 'unavailable')}&lang=zh-cn#channel=${encodeURIComponent(channel)}`;
  if (memberOnly && !stopped) {
    message.textContent = '正在准备播放器，同时读取作品…';
    // Start the authorized download while Scratch boots, and handle early
    // failures immediately even if the iframe never reaches its ready event.
    pendingProject = downloadProject().catch((error) => {
      if (!stopped) fail(error.name === 'AbortError' ? '作品加载已停止，请重新打开。' : error.message);
      return null;
    });
  }
})();
