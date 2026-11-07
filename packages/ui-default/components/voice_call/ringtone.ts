/** A soft local chime. It never opens a microphone or requests media permission. */
export function createCallRinger() {
  let incoming = false;
  let disposed = false;
  let generation = 0;
  let timer = 0;
  let context: AudioContext | null = null;
  let pending = false;
  const oscillators = new Set<OscillatorNode>();
  function silence() {
    generation++; pending = false; window.clearInterval(timer); timer = 0;
    for (const oscillator of oscillators) { try { oscillator.stop(); } catch { /* Already stopped. */ } }
    oscillators.clear();
    const old = context; context = null;
    if (old && old.state !== 'closed') void old.close().catch(() => {});
  }
  async function chime() {
    if (!incoming || disposed || document.hidden || pending) return;
    const Audio = window.AudioContext || (window as any).webkitAudioContext;
    if (!Audio) return;
    const version = generation;
    try {
      if (!context || context.state === 'closed') context = new Audio();
      const active = context!; pending = true;
      await active.resume();
      if (version !== generation || !incoming || disposed || document.hidden || active.state !== 'running') return;
      for (const [index, frequency] of [659.25, 880].entries()) {
        const at = active.currentTime + index * 0.17;
        const oscillator = active.createOscillator(); const gain = active.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.028, at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
        oscillator.connect(gain); gain.connect(active.destination); oscillators.add(oscillator);
        oscillator.onended = () => { oscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + 0.15);
      }
    } catch { /* Browsers may block autoplay; the incoming card stays fully usable. */ }
    finally { if (version === generation) pending = false; }
  }
  function visibility() {
    silence();
    if (incoming && !disposed && !document.hidden) {
      void chime(); timer = window.setInterval(() => { void chime(); }, 4000);
    }
  }
  function activate() { if (incoming && !document.hidden) void chime(); }
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('pointerdown', activate, { passive: true });
  return {
    setIncoming(value: boolean) {
      if (value === incoming || disposed) return;
      incoming = value; visibility();
    },
    dispose() {
      if (disposed) return; disposed = true; incoming = false; silence();
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown', activate);
    },
  };
}
