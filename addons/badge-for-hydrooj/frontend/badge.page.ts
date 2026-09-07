import {
  $, addPage, createBadgeAcThemePlayer, NamedPage, Notification, UserSelectAutoComplete,
} from '@hydrooj/ui-default';

addPage(new NamedPage(['badge_add', 'badge_edit'], () => {
  UserSelectAutoComplete.getOrConstruct<true>($('[name="users"]'), {
    multi: true, clearDefaultValue: false,
  });

  const previewButton = document.querySelector<HTMLButtonElement>('[data-badge-ac-preview]');
  if (!previewButton) return;

  const acImageInput = document.querySelector<HTMLInputElement>('[name="acImage"]');
  const themeSoundInput = document.querySelector<HTMLInputElement>('[name="themeSound"]');
  const removeAcImageInput = document.querySelector<HTMLInputElement>('[name="removeAcImage"]');
  const removeThemeSoundInput = document.querySelector<HTMLInputElement>('[name="removeThemeSound"]');
  const titleInput = document.querySelector<HTMLInputElement>('[name="title"]');
  const shortInput = document.querySelector<HTMLInputElement>('[name="short"]');

  previewButton.addEventListener('click', async () => {
    const objectUrls: string[] = [];
    const getAssetUrl = (
      input: HTMLInputElement | null,
      removeInput: HTMLInputElement | null,
      savedUrl: string,
    ) => {
      const file = input?.files?.[0];
      if (file?.size) {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        return url;
      }
      return removeInput?.checked ? '' : savedUrl;
    };
    const acImage = getAssetUrl(acImageInput, removeAcImageInput, previewButton.dataset.acImage || '');
    const themeSound = getAssetUrl(
      themeSoundInput,
      removeThemeSoundInput,
      previewButton.dataset.themeSound || '',
    );
    if (!acImage && !themeSound) {
      Notification.info(previewButton.dataset.emptyMessage || 'Please upload an AC effect image or theme sound.');
      return;
    }

    const player = createBadgeAcThemePlayer({
      acImage,
      name: shortInput?.value.trim() || titleInput?.value.trim() || 'Badge',
      themeSound,
    });
    previewButton.disabled = true;
    previewButton.classList.add('disabled');
    try {
      await player.play();
    } finally {
      player.dispose();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      previewButton.disabled = false;
      previewButton.classList.remove('disabled');
    }
  });
}));
