import { bindBadgeAcPreview } from '../components/badge_ac_preview';
import { bindBadgeSoundVolume } from '../components/badge_sound_volume';
import { NamedPage } from '../misc/Page';

export default new NamedPage('badge_edit', () => {
  const disposeSoundVolume = bindBadgeSoundVolume();
  const disposePreview = bindBadgeAcPreview();
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) { disposeSoundVolume(); disposePreview(); }
  });
});
