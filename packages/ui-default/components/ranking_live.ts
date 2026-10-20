interface Socket {
  onopen?: (...args: any[]) => void;
  onmessage?: (event: MessageEvent, data: string) => void;
  close(): void;
}

/** Refresh only in response to a persisted ranking update or reconnect.
 * Several updates while a response is in flight collapse into one follow-up. */
export function bindLiveRanking({ doc = document, win = window, socket, url, onRemove = () => {}, onNew = () => {} }: {
  doc?: Document; win?: Window; socket: Socket; url: string;
  onRemove?: (element: HTMLElement) => void; onNew?: (element: HTMLElement) => void;
}) {
  let stopped = false;
  let pending = false;
  let running = false;
  let revision = '';
  let controller: AbortController | null = null;
  const refresh = async () => {
    pending = true;
    if (stopped || running || doc.hidden) return;
    running = true;
    try {
      while (pending && !stopped && !doc.hidden) {
        pending = false;
        const targets = [...doc.querySelectorAll<HTMLElement>('[data-ranking-live]')];
        controller = new AbortController();
        await Promise.all(targets.map(async (target) => {
          const endpoint = new URL(url, win.location.href);
          if (endpoint.origin !== win.location.origin) return;
          const view = target.dataset.rankingLive;
          endpoint.searchParams.set('view', view);
          if (view === 'homepage') endpoint.searchParams.set('limit', target.dataset.rankingLimit || '10');
          else endpoint.searchParams.set('page', new URL(win.location.href).searchParams.get('page') || target.dataset.rankingPage || '1');
          try {
            const response = await win.fetch(endpoint.href, {
              credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal,
            });
            if (!response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) return;
            const result = await response.json();
            if (stopped || !target.isConnected || result.view !== view || typeof result.html !== 'string') return;
            onRemove(target);
            target.innerHTML = result.html;
            onNew(target);
          } catch { /* A dropped connection leaves the last complete ranking visible. */ }
        }));
      }
    } finally { running = false; }
  };
  socket.onmessage = (_event, raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data?.type !== 'ranking-update' || typeof data.revision !== 'string' || data.revision === revision) return;
    revision = data.revision;
    void refresh();
  };
  // Also closes the gap between HTML rendering and opening the connection.
  socket.onopen = () => { void refresh(); };
  const visible = () => { if (pending && !doc.hidden) void refresh(); };
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    controller?.abort();
    socket.close();
    doc.removeEventListener('visibilitychange', visible);
    win.removeEventListener('pagehide', dispose);
  };
  doc.addEventListener('visibilitychange', visible);
  win.addEventListener('pagehide', dispose, { once: true });
  return { dispose };
}
