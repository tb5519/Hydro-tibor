const LEASE = 125000;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value);

/** A discovery hint, never an authorization: the server still verifies room, device and page grant. */
export function createBroadcastPresence(uid: number, wake: () => void) {
  const key = `onebyone.broadcast.active:${uid}`;
  let local: { sessionId: string; expiresAt: number } | null = null;
  let timer = 0;
  let publishing = '';
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      if (validId(value?.sessionId) && Number.isFinite(value.expiresAt)
        && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + LEASE + 5000) return value;
    } catch { /* Sharing on this page can continue without browser storage. */ }
    return local && local.expiresAt > Date.now() ? local : null;
  }
  function publish() {
    if (!publishing) return;
    local = { sessionId: publishing, expiresAt: Date.now() + LEASE };
    try { localStorage.setItem(key, JSON.stringify(local)); } catch { /* Optional cross-tab discovery. */ }
  }
  function pause() { clearInterval(timer); timer = 0; publishing = ''; }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    local = null;
    if (read()) wake();
  };
  window.addEventListener('storage', onStorage);
  return {
    active: () => !!read(),
    start(sessionId: string) {
      pause();
      if (!validId(sessionId)) return;
      publishing = sessionId; publish(); timer = window.setInterval(publish, 20000);
    },
    pause,
    end(sessionId?: string) {
      pause();
      if (sessionId && read()?.sessionId !== sessionId) return;
      local = null;
      try { localStorage.removeItem(key); } catch { /* Optional cross-tab discovery. */ }
    },
    dispose() { pause(); window.removeEventListener('storage', onStorage); },
  };
}
