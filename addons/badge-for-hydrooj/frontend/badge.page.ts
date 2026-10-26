import {
  $, addPage, bindBadgeAcPreview, bindBadgeSoundVolume, NamedPage, UserSelectAutoComplete,
} from '@hydrooj/ui-default';
import { bindBadgeIconUpload } from './badge_icon_upload';

addPage(new NamedPage(['badge_add', 'badge_edit'], () => {
  UserSelectAutoComplete.getOrConstruct<true>($('[name="users"]'), {
    multi: true, clearDefaultValue: false,
  });

  const disposeIconUpload = bindBadgeIconUpload();
  const disposeSoundVolume = bindBadgeSoundVolume();
  const disposePreview = bindBadgeAcPreview();
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) { disposeIconUpload(); disposeSoundVolume(); disposePreview(); }
  });
}));
