import { STATUS_CODES, STATUS_SHORT_TEXTS, STATUS_TEXTS } from '@hydrooj/common';
import React from 'react';
import { i18n } from 'vj/utils';

export default function RecordReplaySource() {
  const source = UiContext.recordReplay;
  if (!source) return null;
  const status = STATUS_SHORT_TEXTS[source.status] || i18n(STATUS_TEXTS[source.status] || 'Waiting');
  return (
    <div className="scratchpad__record-source">
      <span className="scratchpad__record-source-label">原记录</span>
      <strong title={source.name}>{source.name}</strong>
      <span className={`is-${STATUS_CODES[source.status] || 'pending'}`} title={i18n(STATUS_TEXTS[source.status] || 'Waiting')}>{status}</span>
      {Number.isFinite(source.score) && <span>{source.score} 分</span>}
      <span className="scratchpad__record-source-hint">已填入我的作答，可继续编辑</span>
    </div>
  );
}
