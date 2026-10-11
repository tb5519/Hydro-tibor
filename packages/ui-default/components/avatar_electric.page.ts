import { AutoloadPage } from 'vj/misc/Page';

let initialized = false;

export default new AutoloadPage('avatarElectric', () => {
  if (initialized) return;
  initialized = true;
  // Keep this independent of the editor and primary navigation becoming ready.
  void import('./avatar_electric').then(({ installAvatarElectricEffects }) => {
    installAvatarElectricEffects(`/d/${encodeURIComponent(UiContext.domainId || 'system')}/user/avatar-effects`);
  }).catch(() => { initialized = false; });
});
