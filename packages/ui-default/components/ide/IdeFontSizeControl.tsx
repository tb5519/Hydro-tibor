import React, { useSyncExternalStore } from 'react';
import { getIdeFontSize, IDE_FONT_DEFAULT, IDE_FONT_MAX, IDE_FONT_MIN, setIdeFontSize, subscribeIdeFontSize } from './fontSize';

export default function IdeFontSizeControl() {
  const size = useSyncExternalStore(subscribeIdeFontSize, getIdeFontSize, () => IDE_FONT_DEFAULT);
  return <div className="ide-font-size" role="group" aria-label="代码字号">
    <button type="button" aria-label="减小字号" title="减小代码字号" disabled={size <= IDE_FONT_MIN} onClick={() => setIdeFontSize(size - 2)}>−</button>
    <button type="button" className="ide-font-size__value" aria-label={`代码字号 ${size}，点击恢复默认`} title="恢复默认字号" onClick={() => setIdeFontSize(IDE_FONT_DEFAULT)}>{size}<span>px</span></button>
    <button type="button" aria-label="增大字号" title="增大代码字号" disabled={size >= IDE_FONT_MAX} onClick={() => setIdeFontSize(size + 2)}>+</button>
  </div>;
}
