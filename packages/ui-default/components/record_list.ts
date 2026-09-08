interface RecordListOptions {
  page: number;
  noPush: boolean;
  limit: number;
  status?: string | null;
  lang?: string | null;
  patchRow: (previous: HTMLTableRowElement, incoming: HTMLTableRowElement) => void;
  onRemove: (row: HTMLTableRowElement) => void;
  onNew: (row: HTMLTableRowElement) => void;
}

export function updateRecordList(document: Document, html: unknown, options: RecordListOptions) {
  if (typeof html !== 'string') return;
  const table = document.querySelector<HTMLTableElement>('.record_main__table');
  const body = table?.tBodies[0];
  if (!body) return;
  const container = document.createElement('tbody');
  container.innerHTML = html;
  const incoming = container.querySelector<HTMLTableRowElement>('tr[data-rid]');
  if (!incoming?.dataset.rid) return;
  const previous = [...body.rows].find((row) => row.dataset.rid === incoming.dataset.rid);
  const matches = (!options.status || incoming.dataset.recordStatus === options.status)
    && (!options.lang || incoming.dataset.recordLang === options.lang);
  if (!matches) {
    if (!previous) return;
    options.onRemove(previous);
    previous.remove();
  } else if (previous) {
    options.onRemove(previous);
    options.patchRow(previous, incoming);
    options.onNew(previous);
  } else {
    if (options.page > 1 || options.noPush) return;
    body.prepend(incoming);
    options.onNew(incoming);
    while (body.rows.length > options.limit) {
      const last = body.rows[body.rows.length - 1];
      options.onRemove(last);
      last.remove();
    }
  }
  const empty = document.querySelector<HTMLElement>('.record-list__empty');
  const tableWrap = document.querySelector<HTMLElement>('.record-list__table-wrap');
  if (empty) empty.hidden = body.rows.length > 0;
  if (tableWrap) tableWrap.hidden = !body.rows.length;
  document.querySelectorAll('[data-record-count]').forEach((node) => {
    node.textContent = String(body.rows.length);
  });
}
