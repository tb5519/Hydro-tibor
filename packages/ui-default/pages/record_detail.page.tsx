import { STATUS } from '@hydrooj/common';
import Clipboard from 'clipboard';
import $ from 'jquery';
import React from 'react';
import { InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, tpl, withTransitionCallback } from 'vj/utils';
import { createBadgeAcThemePlayer } from '../components/badge_ac_effect';

let testcaseClipboard: Clipboard | null = null;

function setTestcaseExpanded(toggle: HTMLElement, expanded: boolean) {
  const detailId = toggle.getAttribute('aria-controls');
  const detail = detailId ? document.getElementById(detailId) : null;
  if (!detail) return;
  toggle.setAttribute('aria-expanded', String(expanded));
  detail.hidden = !expanded;
  $(toggle).closest('[data-testcase-row]').toggleClass('is-expanded', expanded);
}

function setAllTestcases(root: ParentNode, expanded: boolean) {
  root.querySelectorAll<HTMLElement>('[data-testcase-toggle]').forEach((toggle) => {
    setTestcaseExpanded(toggle, expanded);
  });
}

export default new NamedPage('record_detail', async () => {
  const badgeThemeEffect = UiContext.badgeAcEffect && UiContext.badgeAcFirstEligible !== false
    ? createBadgeAcThemePlayer(UiContext.badgeAcTheme)
    : null;
  let badgeEffectPlayed = false;
  const maybePlayBadgeEffect = (status: unknown) => {
    if (badgeEffectPlayed || Number(status) !== STATUS.STATUS_ACCEPTED) return;
    badgeEffectPlayed = true;
    void badgeThemeEffect?.play();
  };
  let failingCaseAutoOpened = false;
  const maybeOpenFirstFailingCase = (root: ParentNode = document) => {
    if (failingCaseAutoOpened) return;
    const toggle = root.querySelector<HTMLElement>('[data-testcase-toggle][data-testcase-state="fail"]');
    if (!toggle) return;
    setTestcaseExpanded(toggle, true);
    failingCaseAutoOpened = true;
  };

  $(document).off('click.recordDetailCompiler', '.compiler-text').on('click.recordDetailCompiler', '.compiler-text', () => {
    withTransitionCallback(() => {
      $('.collapsed').removeClass('collapsed');
    });
  });
  $(document).off('click.recordDetailMessage', '.subtask-case').on('click.recordDetailMessage', '.subtask-case', function (event) {
    if ($(event.target).closest('[data-testcase-toggle], [data-testcase-copy]').length) return;
    const text = $(this).find('.message').text();
    const data = $(this).find('.message').html();
    if (!text?.trim() || (!text.includes('\n') && text.length < 20)) return;
    new InfoDialog({
      $body: tpl(<pre dangerouslySetInnerHTML={{ __html: data }} />),
    }).open();
  });

  $(document).off('click.recordTestdataToggle', '[data-testcase-toggle]').on(
    'click.recordTestdataToggle',
    '[data-testcase-toggle]',
    function onTestcaseToggle(event) {
      event.preventDefault();
      failingCaseAutoOpened = true;
      setTestcaseExpanded(this, this.getAttribute('aria-expanded') !== 'true');
    },
  );
  $(document).off('click.recordTestdataExpand', '[data-testcase-expand-all]').on(
    'click.recordTestdataExpand',
    '[data-testcase-expand-all]',
    function onExpandAll() {
      failingCaseAutoOpened = true;
      setAllTestcases(this.closest('#status') || document, true);
    },
  );
  $(document).off('click.recordTestdataCollapse', '[data-testcase-collapse-all]').on(
    'click.recordTestdataCollapse',
    '[data-testcase-collapse-all]',
    function onCollapseAll() {
      failingCaseAutoOpened = true;
      setAllTestcases(this.closest('#status') || document, false);
    },
  );

  testcaseClipboard?.destroy();
  testcaseClipboard = new Clipboard('[data-testcase-copy]', {
    text: (trigger) => {
      const contentId = trigger.getAttribute('aria-controls');
      return contentId ? document.getElementById(contentId)?.textContent || '' : '';
    },
  });
  testcaseClipboard.on('success', () => Notification.success(i18n('Content copied to clipboard!'), 1000));
  testcaseClipboard.on('error', () => Notification.error(i18n('Copy failed :(')));

  maybeOpenFirstFailingCase();

  if (!UiContext.socketUrl) {
    maybePlayBadgeEffect(UiContext.recordStatus);
    return;
  }
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    maybePlayBadgeEffect(msg.status);
    if (typeof msg.status === 'number' && window.parent) window.parent.postMessage({ status: msg.status });
    withTransitionCallback(() => {
      const newStatus = $(msg.status_html);
      const oldStatus = $('#status');
      const expandedTestcases = new Set(
        oldStatus.find<HTMLElement>('[data-testcase-toggle][aria-expanded="true"]').get()
          .map((toggle) => toggle.getAttribute('aria-controls')).filter(Boolean),
      );
      oldStatus.trigger('vjContentRemove');
      dd.apply(oldStatus[0], dd.diff(oldStatus[0], newStatus[0]));
      $('#status').trigger('vjContentNew');
      $('#status [data-testcase-toggle]').get().forEach((toggle) => {
        if (expandedTestcases.has(toggle.getAttribute('aria-controls'))) setTestcaseExpanded(toggle, true);
      });
      maybeOpenFirstFailingCase($('#status').get(0));
      const newSummary = $(msg.summary_html);
      const oldSummary = $('#summary');
      oldSummary.trigger('vjContentRemove');
      dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
      $('#summary').trigger('vjContentNew');
    });
  };
});
