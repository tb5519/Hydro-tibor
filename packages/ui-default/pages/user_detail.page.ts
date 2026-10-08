import $ from 'jquery';
import { bindProfileBadgeSound, disposeProfileBadgeSound } from 'vj/components/profile_badge_sound';
import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('user_detail', () => {
  bindProfileBadgeSound(document);
  $(document).off('.profileBadgeSound')
    .on('vjContentNew.profileBadgeSound', (event) => bindProfileBadgeSound(event.target))
    .on('vjContentRemove.profileBadgeSound', (event) => disposeProfileBadgeSound(event.target));
});
