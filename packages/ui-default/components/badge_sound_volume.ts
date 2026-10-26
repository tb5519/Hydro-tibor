const bindings = new WeakMap<HTMLElement, () => void>();

/** Shared by the prebuilt core page and optional addon page. Preview never changes student data. */
export function bindBadgeSoundVolume(doc: Document = document) {
  const panel = doc.querySelector<HTMLElement>('[data-badge-sound-volume]');
  const volume = panel?.querySelector<HTMLInputElement>('[name="themeSoundVolume"]');
  const output = panel?.querySelector<HTMLOutputElement>('[data-badge-sound-volume-value]');
  const preview = panel?.querySelector<HTMLButtonElement>('[data-badge-sound-preview]');
  const status = panel?.querySelector<HTMLElement>('[data-badge-sound-status]');
  if (!panel || !volume || !output || !preview || !status) return () => {};
  if (bindings.has(panel)) return bindings.get(panel)!;
  const file = doc.querySelector<HTMLInputElement>('[name="themeSound"]');
  const remove = doc.querySelector<HTMLInputElement>('[name="removeThemeSound"]');
  const initial = Number(volume.value);
  let audio: HTMLAudioElement | undefined;
  let localUrl = '';
  let disposed = false;
  const selected = () => file?.files?.[0];
  const hasSound = () => !!selected()?.size || (!!panel.dataset.savedSound && !remove?.checked);
  const percent = () => {
    const value = Number(volume.value);
    return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 25;
  };
  const stop = () => {
    if (audio) {
      audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src');
      audio = undefined;
    }
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = '';
    preview.textContent = '试听音效';
  };
  const refresh = () => {
    const value = percent();
    volume.disabled = !hasSound();
    preview.disabled = !hasSound() || value === 0;
    output.value = value === 0 ? '0% · 静音' : `${value}%`;
    if (audio) audio.volume = value / 100;
    if (value === 0) stop();
    status.textContent = !hasSound() ? '上传音效后即可调节音量和试听，个人主页与 AC 特效使用相同音量。'
      : value !== initial ? '音量已调整，点击「更新」后同步用于个人主页和 AC 特效。'
        : '个人主页与 AC 特效共用此音量。0% 为静音，点击下方「更新」保存。';
  };
  const changeSound = () => { stop(); refresh(); };
  const play = async () => {
    if (disposed || !hasSound() || !percent()) return;
    if (audio) { stop(); return; }
    const chosen = selected();
    if (chosen?.size) localUrl = URL.createObjectURL(chosen);
    const current = new Audio(localUrl || panel.dataset.savedSound);
    audio = current;
    current.volume = percent() / 100;
    current.loop = false;
    current.onended = () => { if (audio === current) stop(); };
    current.onerror = () => {
      if (audio !== current) return;
      stop(); status.textContent = '音效暂时无法播放，请检查文件后重试。';
    };
    preview.textContent = '停止试听';
    try { await current.play(); } catch {
      if (disposed || audio !== current) return;
      stop(); status.textContent = '音效暂时无法播放，请再点击试听。';
    }
  };
  const pauseForPage = () => stop();
  volume.addEventListener('input', refresh);
  file?.addEventListener('change', changeSound);
  remove?.addEventListener('change', changeSound);
  preview.addEventListener('click', play);
  doc.defaultView?.addEventListener('pagehide', pauseForPage);
  refresh();
  const dispose = () => {
    if (disposed) return;
    disposed = true; stop();
    volume.removeEventListener('input', refresh);
    file?.removeEventListener('change', changeSound);
    remove?.removeEventListener('change', changeSound);
    preview.removeEventListener('click', play);
    doc.defaultView?.removeEventListener('pagehide', pauseForPage);
    bindings.delete(panel);
  };
  bindings.set(panel, dispose);
  return dispose;
}
