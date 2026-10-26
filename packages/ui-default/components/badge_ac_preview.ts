import { createBadgeAcThemePlayer } from './badge_ac_effect';
import Notification from './notification';

const bindings = new WeakMap<HTMLButtonElement, () => void>();

/** Lives in the locally built UI so badge editing does not require an addon rebuild. */
export function bindBadgeAcPreview(doc: Document = document) {
  const button = doc.querySelector<HTMLButtonElement>('[data-badge-ac-preview]');
  if (!button) return () => {};
  if (bindings.has(button)) return bindings.get(button)!;
  const acImageInput = doc.querySelector<HTMLInputElement>('[name="acImage"]');
  const themeSoundInput = doc.querySelector<HTMLInputElement>('[name="themeSound"]');
  const removeAcImageInput = doc.querySelector<HTMLInputElement>('[name="removeAcImage"]');
  const removeThemeSoundInput = doc.querySelector<HTMLInputElement>('[name="removeThemeSound"]');
  const titleInput = doc.querySelector<HTMLInputElement>('[name="title"]');
  const shortInput = doc.querySelector<HTMLInputElement>('[name="short"]');
  const soundVolumeInput = doc.querySelector<HTMLInputElement>('[name="themeSoundVolume"]');
  let active: ReturnType<typeof createBadgeAcThemePlayer> | undefined;
  let objectUrls: string[] = [];
  let disposed = false;
  const stop = () => {
    active?.dispose(); active = undefined;
    objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls = [];
    button.disabled = false; button.classList.remove('disabled');
  };
  const play = async (event: MouseEvent) => {
    // Older cached addon bundles also bind a bubbling click handler. Keep just this preview.
    event.preventDefault(); event.stopImmediatePropagation();
    if (disposed || active) return;
    const getAssetUrl = (input: HTMLInputElement | null, removeInput: HTMLInputElement | null, savedUrl: string) => {
      const file = input?.files?.[0];
      if (file?.size) {
        const url = URL.createObjectURL(file);
        objectUrls.push(url); return url;
      }
      return removeInput?.checked ? '' : savedUrl;
    };
    const acImage = getAssetUrl(acImageInput, removeAcImageInput, button.dataset.acImage || '');
    const themeSound = getAssetUrl(themeSoundInput, removeThemeSoundInput, button.dataset.themeSound || '');
    if (!acImage && !themeSound) {
      Notification.info(button.dataset.emptyMessage || 'Please upload an AC effect image or theme sound.');
      return;
    }
    const player = createBadgeAcThemePlayer({
      acImage,
      name: shortInput?.value.trim() || titleInput?.value.trim() || 'Badge',
      themeSound,
      themeSoundVolume: soundVolumeInput ? Number(soundVolumeInput.value) : undefined,
    });
    active = player; button.disabled = true; button.classList.add('disabled');
    try { await player.play(); } finally { if (active === player) stop(); }
  };
  button.addEventListener('click', play, true);
  doc.defaultView?.addEventListener('pagehide', stop);
  const dispose = () => {
    if (disposed) return;
    disposed = true; stop();
    button.removeEventListener('click', play, true);
    doc.defaultView?.removeEventListener('pagehide', stop);
    bindings.delete(button);
  };
  bindings.set(button, dispose);
  return dispose;
}
