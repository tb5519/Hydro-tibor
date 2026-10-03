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
  const fail = (text) => {
    runtime?.stop();
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
    const wanted = () => loaded && running && !ended && !document.hidden;
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
      const time = now();
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
          session.lastTick = now();
          if (session.closed) finish(session);
        } catch {
          session.closed = true;
          if (current === session) current = null;
          finish(session);
        }
      })();
    };
    const heartbeat = setInterval(() => {
      sync();
      if (current) { accrue(current); void flush(current); }
    }, 15000);
    document.addEventListener('visibilitychange', sync);
    return {
      setRunning(value) { running = value; sync(); },
      stop() {
        ended = true;
        clearInterval(heartbeat);
        document.removeEventListener('visibilitychange', sync);
        sync();
      },
    };
  };
  runtime = createRuntimeTracker();
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
    if (stopped || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    try {
      if (event.data.type === 'ready' && !initialized) {
        initialized = true;
        if (memberOnly) message.textContent = '正在读取作品，请稍等…';
        const result = await (pendingProject || downloadProject());
        if (stopped || !result) return;
        frame.contentWindow.postMessage({ channel, type: 'init', mode: 'player', readOnly: true,
          title: result.title, project: result.project }, '*', [result.project]);
        sentProject = true;
        if (memberOnly) message.textContent = '作品已读取，正在准备舞台…';
      } else if (event.data.type === 'loaded' && sentProject) {
        loaded = true;
        clearTimeout(timer);
        status.hidden = true;
      } else if (event.data.type === 'runState' && loaded && typeof event.data.running === 'boolean') {
        runtime?.setRunning(event.data.running);
      } else if (event.data.type === 'error') {
        throw new Error(loaded ? '作品暂时无法运行，请重新打开。' : '这个作品暂时无法打开，请稍后重试。');
      }
    } catch (error) {
      if (!stopped) fail(error.name === 'AbortError' ? '作品加载已停止，请重新打开。' : error.message);
    }
  });
  window.addEventListener('pagehide', () => { runtime?.stop(); stopped = true; controller.abort(); clearTimeout(timer); }, { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  // v must be first so older site service workers bypass their entry cache.
  frame.src = `/scratch-editor/editor.html?v=${encodeURIComponent(root.dataset.editorVersion || 'unavailable')}&lang=zh-cn#channel=${encodeURIComponent(channel)}`;
  if (memberOnly) {
    message.textContent = '正在准备播放器，同时读取作品…';
    // Start the authorized download while Scratch boots, and handle early
    // failures immediately even if the iframe never reaches its ready event.
    pendingProject = downloadProject().catch((error) => {
      if (!stopped) fail(error.name === 'AbortError' ? '作品加载已停止，请重新打开。' : error.message);
      return null;
    });
  }
})();
