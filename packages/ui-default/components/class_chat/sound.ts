/** One gentle reminder per account, including when several platform tabs are open. */
export function createStudentChatReminder(uid: number, enabled: boolean, win: Window = window) {
  let context: AudioContext | null = null;
  let unread = false;
  let disposed = false;
  const id = `${Date.now()}-${Math.random()}`;
  const key = `onebyone.class-chat.sound:${uid}`;
  let ownLease = false;
  let lastBeep = 0;
  const claim = () => {
    try {
      const lease = JSON.parse(win.localStorage.getItem(key) || 'null');
      if (lease && lease.id !== id && lease.until > Date.now()) return false;
      win.localStorage.setItem(key, JSON.stringify({ id, until: Date.now() + 11000 }));
      ownLease = true;
      return true;
    } catch { return !win.document.hidden; }
  };
  const release = () => {
    if (!ownLease) return;
    try {
      if (JSON.parse(win.localStorage.getItem(key) || 'null')?.id === id) win.localStorage.removeItem(key);
    } catch { /* No persistent storage is required to chat. */ }
    ownLease = false;
  };
  function beep() {
    if (!enabled || !unread || disposed || !context || context.state !== 'running'
      || Date.now() - lastBeep < 10000 || !claim()) return;
    lastBeep = Date.now();
    for (const [offset, frequency] of [[0, 660], [0.14, 880]]) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const start = context.currentTime + offset;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.075, start + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      oscillator.connect(volume); volume.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + 0.27);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    }
  }
  async function unlock() {
    if (!enabled || disposed) return;
    try {
      const Audio = (win as any).AudioContext || (win as any).webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      if (context.state === 'suspended') await context.resume();
      beep();
    } catch { /* Browsers require a user gesture before allowing audio. The badge stays visible. */ }
  }
  const gesture = () => { void unlock(); };
  if (enabled) {
    win.document.addEventListener('pointerdown', gesture, { capture: true, passive: true });
    win.document.addEventListener('keydown', gesture, true);
  }
  const interval = enabled ? win.setInterval(beep, 10000) : 0;
  return {
    setUnread(value: boolean) { unread = value; if (value) beep(); else release(); },
    isUnlocked: () => context?.state === 'running',
    dispose() {
      disposed = true;
      win.clearInterval(interval);
      win.document.removeEventListener('pointerdown', gesture, true);
      win.document.removeEventListener('keydown', gesture, true);
      release(); void context?.close();
    },
  };
}
