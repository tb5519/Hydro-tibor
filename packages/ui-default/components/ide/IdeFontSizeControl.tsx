import React, { useSyncExternalStore } from 'react';
import { CODE_FONT_STEP, getIdeFontSize, IDE_FONT_DEFAULT, IDE_FONT_MAX, IDE_FONT_MIN, setIdeFontSize, subscribeIdeFontSize, usesMacFontShortcuts } from './fontSize';

export default function IdeFontSizeControl() {
  const size = useSyncExternalStore(subscribeIdeFontSize, getIdeFontSize, () => IDE_FONT_DEFAULT);
  const mac = usesMacFontShortcuts();
  return <div className="ide-font-size" role="group" aria-label="代码字号">
    <button type="button" aria-label="减小字号" title={mac ? '减小代码字号（⌘− 或按住 ⌘ 向下滚动）' : '减小代码字号（Ctrl + 向下滚轮）'} disabled={size <= IDE_FONT_MIN} onClick={() => setIdeFontSize(size - CODE_FONT_STEP)}>−</button>
    <button type="button" className="ide-font-size__value" aria-label={`代码字号 ${size}，点击恢复默认`} title="恢复默认字号" onClick={() => setIdeFontSize(IDE_FONT_DEFAULT)}>{size}<span>px</span></button>
    <button type="button" aria-label="增大字号" title={mac ? '增大代码字号（⌘+ 或按住 ⌘ 向上滚动）' : '增大代码字号（Ctrl + 向上滚轮）'} disabled={size >= IDE_FONT_MAX} onClick={() => setIdeFontSize(size + CODE_FONT_STEP)}>+</button>
  </div>;
}
