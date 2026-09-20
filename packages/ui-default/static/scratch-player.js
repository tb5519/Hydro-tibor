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
  let stopped = false;
  let initialized = false;
  let sentProject = false;
  let loaded = false;
  const fail = (text) => {
    clearTimeout(timer);
    controller.abort();
    stopped = true;
    frame.remove();
    message.textContent = text;
    status.hidden = false;
    status.dataset.error = 'true';
    retry.hidden = false;
  };
  const timer = setTimeout(() => fail('作品加载有点慢，请检查网络后重新打开。'), 120000);
  retry.addEventListener('click', () => location.reload());
  window.addEventListener('message', async (event) => {
    if (stopped || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    try {
      if (event.data.type === 'ready' && !initialized) {
        initialized = true;
        const config = JSON.parse(root.dataset.config);
        const url = new URL(config.projectUrl, location.href);
        if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('分享地址无效。');
        const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal, referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('分享已关闭或无法访问，请向作者获取新的链接。');
        const maxSize = Math.min(Number(config.maxFileSize) || 0, 20 * 1024 * 1024);
        if (+response.headers.get('content-length') > maxSize) throw new Error('作品文件过大，暂时无法播放。');
        const blob = await response.blob();
        if (blob.size > maxSize) throw new Error('作品文件过大，暂时无法播放。');
        const project = await blob.arrayBuffer();
        if (stopped) return;
        frame.contentWindow.postMessage({ channel, type: 'init', mode: 'player', readOnly: true,
          title: config.title, project }, '*', [project]);
        sentProject = true;
      } else if (event.data.type === 'loaded' && sentProject) {
        loaded = true;
        clearTimeout(timer);
        status.hidden = true;
      } else if (event.data.type === 'error') {
        throw new Error(loaded ? '作品暂时无法运行，请重新打开。' : '这个作品暂时无法打开，请稍后重试。');
      }
    } catch (error) {
      if (!stopped) fail(error.name === 'AbortError' ? '作品加载已停止，请重新打开。' : error.message);
    }
  });
  window.addEventListener('pagehide', () => { stopped = true; controller.abort(); clearTimeout(timer); }, { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  frame.src = `/scratch-editor/editor.html?lang=zh-cn#channel=${encodeURIComponent(channel)}`;
})();
