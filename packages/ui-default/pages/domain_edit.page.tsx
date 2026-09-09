import $ from 'jquery';
import LanguageSelectAutoComplete from 'vj/components/autocomplete/LanguageSelectAutoComplete';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';
import { prepareDomainAvatar } from 'vj/utils/domain_avatar';

export function bindDomainAvatarUpload() {
  const $input = $('input[name=avatar]');
  const template = document.querySelector<HTMLTemplateElement>('#domain-avatar-upload-template');
  if (!$input.length || !template || $input.prop('disabled')) return;
  const $field = $input.closest('.textbox-container');
  if ($field.find('.domain-avatar-control').length) return;
  const $label = $input.closest('label');
  const $form = $input.closest('form');
  $input.attr({ id: 'domain-avatar-value', type: 'hidden' });
  $label.removeAttr('for').attr('id', 'domain-avatar-label');
  $field.insertAfter($label);
  $label.text('域头像');
  $field.closest('.form__item').addClass('domain-avatar-setting');
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const $fragment = $(fragment);
  const $control = $fragment.find('.domain-avatar-control');
  $control.attr({ role: 'group', 'aria-labelledby': 'domain-avatar-label' });
  const $button = $fragment.find('.domain-avatar-control__button');
  const buttonContent = $button.html();
  const $file = $fragment.find<HTMLInputElement>('.domain-avatar-control__file');
  const $preview = $fragment.find('.domain-avatar-control__preview');
  const $status = $fragment.find('.domain-avatar-control__status');
  $button.before($input);
  $field.empty().append(fragment);
  let uploading = false;
  $button.on('click', (event) => {
    event.preventDefault();
    if (!uploading) $file[0].click();
  });
  $form.on('submit.domainAvatar', (event) => {
    if (uploading) event.preventDefault();
  });
  $file.on('change', async () => {
    const file = $file[0].files[0];
    if (!file || uploading) return;
    uploading = true;
    const originalPreview = $preview.attr('src');
    const $submit = $form.find(':submit:not(:disabled)');
    let temporaryPreview = '';
    $control.attr('aria-busy', 'true');
    $input.prop('disabled', true);
    $button.prop('disabled', true).text('正在上传…');
    $submit.prop('disabled', true);
    $status.removeClass('is-error is-success').text('正在处理并上传图片，请稍候…');
    try {
      const image = await prepareDomainAvatar(file);
      temporaryPreview = URL.createObjectURL(image);
      $preview.attr('src', temporaryPreview);
      const data = new FormData();
      data.append('file', image, 'avatar.png');
      const response = await request.postFile($control.attr('data-upload-url'), data, { timeout: 30000, dataType: 'json' });
      if (typeof response.avatar !== 'string' || typeof response.avatarUrl !== 'string') throw new Error('未收到上传结果，请刷新页面确认。');
      $input.val(response.avatar).trigger('change');
      $preview.attr('src', response.avatarUrl);
      $status.addClass('is-success').text('域头像已更新并生效，无需再点击保存。');
      Notification.success('域头像已更新');
    } catch (error) {
      $preview.attr('src', originalPreview);
      const message = error.message || '上传失败，请稍后重试。';
      $status.addClass('is-error').text(message);
      Notification.error(message);
    } finally {
      if (temporaryPreview) URL.revokeObjectURL(temporaryPreview);
      $file.val('');
      $input.prop('disabled', false);
      $button.prop('disabled', false).html(buttonContent);
      $submit.prop('disabled', false);
      $control.attr('aria-busy', 'false');
      uploading = false;
    }
  });
}

const page = new NamedPage('domain_edit', () => {
  LanguageSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true });
  bindDomainAvatarUpload();
});

export default page;
