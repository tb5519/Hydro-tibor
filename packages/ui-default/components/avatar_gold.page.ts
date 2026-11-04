import { AutoloadPage } from 'vj/misc/Page';

let initialized = false;

export default new AutoloadPage('avatarGold', () => {
  if (initialized) return;
  initialized = true;
  // Keep this independent of the editor and primary navigation becoming ready.
  void import('./avatar_gold').then(({ installAvatarGoldEffects }) => {
    installAvatarGoldEffects(`/d/${encodeURIComponent(UiContext.domainId || 'system')}/user/avatar-effects`);
  }).catch(() => { initialized = false; });
});
