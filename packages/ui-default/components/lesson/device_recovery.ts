type Device = 'camera' | 'microphone';

// Recover only a previously working track. Device permission is never requested
// automatically after an ambiguous OS wake, permission reset, or classroom exit.
export function watchLostDevice(device: Device, options: {
  active(): boolean; restart(): Promise<boolean>; denied(): void;
}) {
  let lost = false;
  let checking = false;
  let epoch = 0;
  let timer = 0;
  let retries = 0;
  let healthySince = 0;

  function clear() {
    epoch++; lost = false; checking = false; retries = 0; healthySince = 0;
    window.clearTimeout(timer); timer = 0;
  }
  async function check() {
    if (!lost || checking || timer || retries >= 2 || !options.active()) return;
    checking = true;
    const attempt = epoch;
    try {
      const result = await navigator.permissions?.query({ name: device as PermissionName });
      if (attempt !== epoch || !options.active()) return;
      if (result?.state !== 'granted') {
        lost = false;
        if (result?.state === 'denied') options.denied();
        return;
      }
      if (navigator.mediaDevices?.enumerateDevices) {
        const kind = device === 'camera' ? 'videoinput' : 'audioinput';
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!devices.some(item => item.kind === kind)) return; // devicechange will retry.
      }
      if (attempt !== epoch || !options.active()) return;
      retries++;
      const ready = await options.restart();
      if (attempt !== epoch) return;
      lost = !ready;
      if (ready) healthySince = Date.now();
      else if (retries < 2) timer = window.setTimeout(() => { timer = 0; void check(); }, 1500);
    } catch { if (attempt === epoch) lost = false; } // Keep explicit retry available when permission cannot be queried.
    finally { if (attempt === epoch) checking = false; }
  }
  return { clear, check, lost() {
    if (healthySince && Date.now() - healthySince >= 30000) retries = 0;
    healthySince = 0; lost = true; void check();
  } };
}
