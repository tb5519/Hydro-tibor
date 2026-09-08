import $ from 'jquery';
import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import Notification from 'vj/components/notification';
import { updateRecordList } from 'vj/components/record_list';
import { NamedPage } from 'vj/misc/Page';
import { getAvailableLangs, request, tpl } from 'vj/utils';

const page = new NamedPage('record_main', async () => {
  const filters = new URLSearchParams(window.location.search);
  const $userFilter = $('[name="uidOrName"]');
  const $problemFilter = $('[name="pid"]');
  if ($userFilter.length) {
    UserSelectAutoComplete.getOrConstruct($userFilter, {
      clearDefaultValue: false,
      props: { height: '35px', placeholder: '全部学员 / 输入用户名' },
    });
  }
  if ($problemFilter.length) {
    ProblemSelectAutoComplete.getOrConstruct($problemFilter, {
      clearDefaultValue: false,
      props: { height: '35px', placeholder: '全部题目 / 输入题号' },
    });
  }
  const $languageFilter = $('select[name="lang"]');
  if ($languageFilter.length) {
    const langs = UiContext.domain.langs?.split(',').map((i) => i.trim()).filter((i) => i);
    const availableLangs = getAvailableLangs(langs?.length ? langs : undefined);
    Object.keys(availableLangs).forEach((i) => {
      $languageFilter.append(tpl`<option value="${i}">${availableLangs[i].display}</option>`);
    });
    if (filters.get('lang')) $languageFilter.val(filters.get('lang'));
  }

  for (const operation of ['rejudge', 'cancel']) {
    $(document).on('click', `[name="operation"][value="${operation}"]`, (ev) => {
      ev.preventDefault();
      const action = $(ev.target).closest('form').attr('action');
      request.post(action, { operation }).catch((e) => Notification.error(e));
    });
  }

  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  const configuredLimit = Number(UiContext.recordListPageSize);
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 50;

  sock.onopen = () => sock.send(JSON.stringify({ rids: UiContext.rids }));
  sock.onmessage = (_, data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch { return; }
    updateRecordList(document, msg?.html, {
      page: Number(filters.get('page')) || 1,
      noPush: filters.has('nopush'),
      limit,
      status: filters.get('status'),
      lang: filters.get('lang'),
      patchRow: (previous, incoming) => dd.apply(previous, dd.diff(previous, incoming)),
      onRemove: (row) => $(row).trigger('vjContentRemove'),
      onNew: (row) => $(row).trigger('vjContentNew'),
    });
  };
});

export default page;
