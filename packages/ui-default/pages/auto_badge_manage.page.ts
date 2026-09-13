import $ from 'jquery';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

const page = new NamedPage(['badge_manage', 'domain_badge_manage'], () => {
  const panel = document.querySelector<HTMLElement>('[data-auto-badges]');
  if (!panel) return;
  let activeDialog: ActionDialog | null = null;

  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-auto-badge-edit], [data-auto-badge-remove]');
    const row = button?.closest<HTMLElement>('[data-auto-badge-row]');
    if (!button || !row || activeDialog) return;
    const removing = button.hasAttribute('data-auto-badge-remove');
    const template = document.querySelector<HTMLTemplateElement>(removing ? '#auto-badge-remove-dialog' : '#auto-badge-edit-dialog');
    if (!template) return;
    const body = template.content.firstElementChild.cloneNode(true) as HTMLElement;
    body.querySelector('[data-dialog-student]').textContent = row.dataset.userName || '';
    body.querySelector('[data-dialog-badge]').textContent = row.dataset.badgeName || '';
    (body.querySelector('[data-dialog-overlap]') as HTMLElement).hidden = row.dataset.manualOverlap !== 'true';
    const expires = body.querySelector<HTMLInputElement>('[name="expiresAt"]');
    const permanent = body.querySelector<HTMLInputElement>('[name="permanent"]');
    const error = body.querySelector<HTMLElement>('[data-dialog-error]');
    if (expires && permanent) {
      expires.value = row.dataset.expiresAt || '';
      permanent.checked = row.dataset.permanent === 'true';
      const syncPermanent = () => {
        expires.disabled = permanent.checked;
        expires.required = !permanent.checked;
      };
      syncPermanent();
      permanent.addEventListener('change', syncPermanent);
    }
    let saving = false;
    const saveLabel = removing ? '确认移除' : '保存';
    const actions = $('<div>')
      .append($('<button type="button" class="rounded button" data-action="cancel">').text('取消'))
      .append($('<button type="button" class="primary rounded button" data-action="save">')
        .toggleClass('auto-badge-dialog__remove', removing).text(saveLabel));
    const dialog = new ActionDialog({
      classes: 'auto-badge-dialog',
      $body: $(body),
      $action: actions.children(),
      onDispatch(action) {
        if (saving) return false;
        if (action !== 'save') return true;
        error.hidden = true;
        if (!removing && !permanent.checked && !expires.reportValidity()) return false;
        saving = true;
        dialog.$dom.find('button').prop('disabled', true);
        dialog.$dom.find('[data-action="save"]').text(removing ? '移除中…' : '保存中…');
        request.post('', {
          operation: removing ? 'auto_badge_remove' : 'auto_badge_update',
          key: row.dataset.key,
          ...(!removing ? { expiresAt: permanent.checked ? '' : expires.value, permanent: permanent.checked } : {}),
        }).then(() => {
          Notification.success(removing ? '已移除自动徽章记录' : '徽章有效期已更新');
          // Keep the current search and page when returning to this section.
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#auto-badges`);
          window.location.reload();
        }).catch((err) => {
          error.textContent = err.message || '操作失败，请稍后重试。';
          error.hidden = false;
          Notification.error(error.textContent);
          saving = false;
          dialog.$dom.find('button').prop('disabled', false);
          dialog.$dom.find('[data-action="save"]').text(saveLabel);
        });
        return false;
      },
    });
    dialog.$dom.attr({ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': removing ? 'auto-badge-remove-title' : 'auto-badge-edit-title' });
    activeDialog = dialog;
    dialog.open().finally(() => {
      activeDialog = null;
      button.focus();
    });
  });
});

export default page;
