const TABLE_SELECTOR = 'table.ranking-badge-effects, table.homepage-ranking-table';
const ROW_SELECTOR = '.ranking-badge-effects > tbody > tr.ranking-row--badge, '
  + '.homepage-ranking-table > tbody > tr.ranking-row--badge';

/** Shared table coordinates avoid WebKit restarting row gradients in every cell. */
export function measureRankingRowEffects(
  doc: Document = document,
  matchingRows = [...doc.querySelectorAll<HTMLTableRowElement>(ROW_SELECTOR)],
) {
  // Batch all layout reads before writing styles; no measured value affects geometry.
  const rows = matchingRows.map((row) => {
    const bounds = row.getBoundingClientRect();
    return {
      row,
      width: bounds.width,
      cells: [...row.cells].map((cell) => ({ cell, x: bounds.left - cell.getBoundingClientRect().left })),
    };
  });
  for (const { row, width, cells } of rows) {
    if (!Number.isFinite(width) || width <= 0) continue;
    const rowWidth = `${width}px`;
    if (row.style.getPropertyValue('--badge-row-width') !== rowWidth) row.style.setProperty('--badge-row-width', rowWidth);
    for (const { cell, x } of cells) {
      const offset = `${x}px`;
      if (cell.style.getPropertyValue('--badge-cell-x') !== offset) cell.style.setProperty('--badge-cell-x', offset);
    }
    if (!row.hasAttribute('data-ranking-effect-ready')) row.setAttribute('data-ranking-effect-ready', '');
  }
}

export function installRankingRowEffects(doc: Document = document, win = window) {
  let disposed = false;
  let frame = 0;
  const observed = new Set<Element>();
  const origins = new WeakMap<HTMLTableRowElement, number>();
  const schedule = () => {
    if (!disposed && !frame) frame = win.requestAnimationFrame(refresh);
  };
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : null;
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  function synchronize(row: HTMLTableRowElement) {
    // A cell restored from display:none or replaced by PJAX gets a new CSSAnimation.
    // Keep one timeline origin per row so the new sweep joins its existing neighbours.
    for (const cell of row.cells) {
      const animations = typeof cell.getAnimations === 'function' ? cell.getAnimations() : [];
      for (const animation of animations) {
        const name = (animation as CSSAnimation).animationName;
        if (name !== 'ranking-row-flow' && name !== 'homepage-ranking-row-flow') continue;
        if (!origins.has(row)) {
          const origin = typeof animation.startTime === 'number' ? animation.startTime : doc.timeline?.currentTime;
          if (typeof origin !== 'number') continue;
          origins.set(row, origin);
        }
        const origin = origins.get(row);
        if (animation.startTime !== origin) animation.startTime = origin;
      }
    }
  }

  function refresh() {
    frame = 0;
    if (disposed) return;
    const rows = [...doc.querySelectorAll<HTMLTableRowElement>(ROW_SELECTOR)];
    const current = new Set<Element>();
    for (const row of rows) {
      // Observe cells too: automatic column sizing can change without changing table width.
      const table = row.closest('table');
      if (table) current.add(table);
      current.add(row);
      [...row.cells].forEach((cell) => current.add(cell));
    }
    for (const target of observed) {
      if (current.has(target)) continue;
      resize?.unobserve(target);
      observed.delete(target);
    }
    for (const target of current) {
      if (observed.has(target)) continue;
      resize?.observe(target);
      observed.add(target);
    }
    measureRankingRowEffects(doc, rows);
    rows.forEach(synchronize);
  }

  const containsTable = (node: Node) => node instanceof win.Element
    && (node.matches(TABLE_SELECTOR) || !!node.querySelector(TABLE_SELECTOR));
  const mutations = new win.MutationObserver((records) => {
    if (records.some((record) => {
      const target = record.target instanceof win.Element ? record.target : record.target.parentElement;
      if (target && (observed.has(target) || target.closest(TABLE_SELECTOR))) return true;
      return record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(containsTable);
    })) schedule();
  });
  mutations.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  win.addEventListener('resize', schedule, { passive: true });
  motion?.addEventListener('change', schedule);
  doc.fonts?.addEventListener('loadingdone', schedule);
  void doc.fonts?.ready.then(schedule);
  refresh();

  return () => {
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    resize?.disconnect();
    mutations.disconnect();
    win.removeEventListener('resize', schedule);
    motion?.removeEventListener('change', schedule);
    doc.fonts?.removeEventListener('loadingdone', schedule);
  };
}
