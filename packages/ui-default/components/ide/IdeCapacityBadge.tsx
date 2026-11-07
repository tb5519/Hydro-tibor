import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getIdeCapacityStore } from './capacity';

interface Props { language?: string; getLanguage?: () => string; local?: boolean }
export default function IdeCapacityBadge({ language = '', getLanguage, local = false }: Props) {
  const store = getIdeCapacityStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const lang = getLanguage?.() || language;
  const { data } = state;
  const cpp = lang === 'c' || lang === 'cc' || lang.startsWith('cc.');
  const releasing = state.releasing || !!data?.resetting;
  const teacher = data?.canRelease === true;
  let text = '检查中'; let tone = 'checking';
  if (state.status === 'offline') { text = '状态离线'; tone = 'offline'; }
  else if (releasing) { text = '正在释放'; tone = 'waiting'; }
  else if (data) {
    if (data.ownRunning && !local) { text = '程序运行中'; tone = 'available'; }
    else if (!data.available) { text = '需要等待'; tone = 'waiting'; }
    else if (cpp && data.compilerBusy) { text = '编译稍候'; tone = 'waiting'; }
    else { text = '可直接运行'; tone = 'available'; }
  }
  if (state.feedback) { text = state.feedback; tone = state.error ? 'offline' : 'available'; }
  const title = [state.error || (data ? `运行位置：${data.used}/${data.capacity} 已占用` : '正在检查运行位置'),
    data?.compilerBusy && (!data.ownRunning || local) ? 'C/C++ 编译器正忙，Python 可使用空闲位置' : '',
    teacher ? '老师双击可停止所有当前 IDE 程序，释放运行位置' : '',
  ].filter(Boolean).join('；');
  const content = <><span className="ide-capacity__dot" aria-hidden="true"/><span>{text}</span></>;
  return <span className={`ide-capacity ide-capacity--${tone}`} data-ide-capacity="" data-ide-capacity-local={local ? '' : undefined}>
    {teacher ? <button type="button" className="ide-capacity__control" disabled={releasing} title={title}
      aria-label={`${text}，双击停止所有 IDE 程序`} onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); void store.release(); }}>{content}</button>
      : <span className="ide-capacity__control" title={title} role="status">{content}</span>}
  </span>;
}

/** A replayed student control cannot acquire teacher powers. Mount a separate,
 * teacher-owned control beside it; its requests use this document's session. */
export function attachIdeCapacityMirror(container: Document | HTMLElement) {
  const doc = container.nodeType === 9 ? container as Document : container.ownerDocument;
  const mounted = new Map<HTMLElement, { host: HTMLElement; root: Root; previousDisplay: string; previousPriority: string }>();
  let disposed = false; let frame = 0;
  function reconcile() {
    frame = 0; if (disposed) return;
    for (const [marker, value] of mounted) {
      if (!marker.isConnected || !value.host.isConnected) { value.root.unmount(); value.host.remove(); mounted.delete(marker); }
    }
    for (const marker of container.querySelectorAll<HTMLElement>('[data-ide-capacity]')) {
      if (marker.closest('[data-ide-capacity-local]')) continue;
      let value = mounted.get(marker);
      if (!value) {
        const host = doc.createElement('span'); host.dataset.ideCapacityLocal = ''; host.dataset.liveShareUi = '';
        host.style.setProperty('visibility', 'visible', 'important'); host.style.display = 'inline-flex';
        value = { host, root: createRoot(host), previousDisplay: marker.style.getPropertyValue('display'), previousPriority: marker.style.getPropertyPriority('display') };
        mounted.set(marker, value); marker.after(host);
      }
      if (marker.style.display !== 'none') marker.style.setProperty('display', 'none', 'important');
      value.root.render(<IdeCapacityBadge local getLanguage={() => marker.closest('.scratchpad__toolbar')?.querySelector<HTMLSelectElement>('select')?.value || ''}/>);
    }
  }
  const observer = new MutationObserver((records) => {
    if (records.every((record) => (record.target as Element).closest?.('[data-ide-capacity-local]'))) return;
    if (!frame) frame = window.requestAnimationFrame(reconcile);
  });
  observer.observe(container.nodeType === 9 ? doc.documentElement : container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'value', 'selected'] });
  const changed = () => { if (!frame) frame = window.requestAnimationFrame(reconcile); };
  doc.addEventListener('change', changed); reconcile();
  return { owns(target: EventTarget | null) {
    if (!target || typeof (target as Node).nodeType !== 'number') return false;
    return [...mounted.values()].some(({ host }) => host === target || host.contains(target as Node));
  }, dispose() {
    disposed = true; observer.disconnect(); window.cancelAnimationFrame(frame); doc.removeEventListener('change', changed);
    for (const [marker, value] of mounted) {
      value.root.unmount(); value.host.remove();
      if (marker.isConnected) { if (value.previousDisplay) marker.style.setProperty('display', value.previousDisplay, value.previousPriority); else marker.style.removeProperty('display'); }
    }
    mounted.clear();
  } };
}
