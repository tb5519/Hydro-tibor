/* eslint-disable react-refresh/only-export-components */
import $ from 'jquery';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InfoDialog } from 'vj/components/dialog';
import { STATUS, STATUS_CODES, STATUS_SCRATCHPAD_SHORT_TEXTS, STATUS_TEXTS } from 'vj/constant/record';
import { i18n, request, secureRandomString } from 'vj/utils';

interface ProblemRecord {
  rid: string;
  name: string;
  status: number;
  score?: number;
  lang: string;
  langName?: string;
  submittedAt: string;
  canImport: boolean;
  importUrl?: string;
}

interface RecordPage {
  records: ProblemRecord[];
  nextCursor: string | null;
}

const statusLabel = (status: number) => STATUS_SCRATCHPAD_SHORT_TEXTS[status]
  || (status === STATUS.STATUS_COMPILE_ERROR ? 'CE' : i18n(STATUS_TEXTS[status] || 'Unknown'));

function importRecord(record: ProblemRecord) {
  if (!record.canImport || !record.importUrl) return;
  const url = new URL(record.importUrl, window.location.href);
  if (url.origin !== window.location.origin) return;
  url.searchParams.set('draftImport', window.crypto.randomUUID?.() || secureRandomString());
  window.location.assign(url.toString());
}

function ProblemRecordPicker({ url, initialAccepted }: { url: string, initialAccepted: boolean }) {
  const [accepted, setAccepted] = useState(initialAccepted);
  const [records, setRecords] = useState<ProblemRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const cursor = useRef<string>(null);

  async function load(pageCursor: string = null) {
    const current = ++sequence.current;
    cursor.current = pageCursor;
    setLoading(true);
    setError(false);
    try {
      const response: RecordPage = await request.get(url, { accepted, ...(pageCursor ? { cursor: pageCursor } : {}) }, { timeout: 15000 });
      if (sequence.current !== current) return;
      if (!Array.isArray(response.records)) throw new Error('Invalid record list');
      setRecords((previous) => {
        const combined = pageCursor ? [...previous, ...response.records] : response.records;
        return [...new Map(combined.map((record) => [record.rid, record])).values()];
      });
      setNextCursor(response.nextCursor || null);
    } catch {
      if (sequence.current === current) setError(true);
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }

  useEffect(() => {
    setRecords([]);
    setNextCursor(null);
    load();
    return () => { sequence.current += 1; };
  }, [accepted]);

  return <div className="problem-record-picker">
    <header className="problem-record-picker__header">
      <div>
        <span className="problem-record-picker__eyebrow">本题作答</span>
        <h1 id="problem-record-picker-title">提交记录</h1>
      </div>
      <button
        type="button"
        className="problem-record-picker__close"
        data-action="cancel"
        aria-label="关闭提交记录"
        data-autofocus
      ><span aria-hidden="true">×</span></button>
    </header>
    <div className="problem-record-picker__toolbar">
      <div className="problem-record-picker__filters" role="group" aria-label="筛选提交记录">
        <button type="button" aria-pressed={!accepted} onClick={() => setAccepted(false)}>全部记录</button>
        <button type="button" aria-pressed={accepted} onClick={() => setAccepted(true)}>仅已通过</button>
      </div>
      <span className="problem-record-picker__order">最新提交在前</span>
    </div>
    <p className="problem-record-picker__hint" id="problem-record-picker-description">选择一条记录，填入我的作答并查看该次结果。</p>
    <div className="problem-record-picker__scroll" aria-busy={loading}>
      {!!records.length && <ul className="problem-record-picker__list" aria-label="本题提交记录">
        {records.map((record) => {
          const canImport = record.canImport && !!record.importUrl;
          const label = statusLabel(record.status);
          const submittedAt = new Date(record.submittedAt);
          const time = Number.isNaN(submittedAt.getTime()) ? '' : submittedAt.toLocaleString('zh-CN', { hour12: false });
          return <li key={record.rid}>
            <button
              type="button"
              className="problem-record-picker__record"
              disabled={!canImport}
              onClick={() => importRecord(record)}
              aria-label={`${record.name}，${label}，${canImport ? '填入我的作答' : '暂无作答查看权限'}`}
            >
              <span className="problem-record-picker__student">
                <span className="problem-record-picker__name">{record.name}</span>
                <span className="problem-record-picker__details">
                  <span>{record.lang === '_' ? '客观题' : record.langName || record.lang || '—'}</span>
                  <time dateTime={record.submittedAt}>{time}</time>
                </span>
                {!canImport && <span className="problem-record-picker__unavailable">暂无作答查看权限</span>}
              </span>
              <span className="problem-record-picker__result">
                <span className={`problem-record-picker__status is-${STATUS_CODES[record.status] || 'ignored'}`}>{label}</span>
                {typeof record.score === 'number' && <span className="problem-record-picker__score">
                  {record.score.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}<small> 分</small>
                </span>}
              </span>
              {canImport && <span className="problem-record-picker__arrow" aria-hidden="true">↗</span>}
            </button>
          </li>;
        })}
      </ul>}
      {loading && <div className="problem-record-picker__state" role="status">正在加载提交记录…</div>}
      {error && <div className="problem-record-picker__state" role="alert">
        <span>暂时无法加载，请重试。</span>
        <button type="button" className="problem-record-picker__retry" onClick={() => load(cursor.current)}>重新加载</button>
      </div>}
      {!loading && !error && !records.length && <div className="problem-record-picker__state">
        <span className="problem-record-picker__empty-icon icon icon-record" aria-hidden="true" />
        <span>{accepted ? '这道题暂时还没有通过记录' : '这道题暂时还没有提交记录'}</span>
      </div>}
      {!loading && !error && nextCursor && <button
        type="button"
        className="problem-record-picker__more"
        onClick={() => load(nextCursor)}
      >加载更多记录</button>}
    </div>
  </div>;
}

export function bindProblemRecordPicker() {
  let activeDialog: InfoDialog;
  $(document).off('click.problemRecordPicker').on('click.problemRecordPicker', '[data-problem-record-picker]', (event) => {
    const config = UiContext.problemRecordPicker;
    if (!config?.url || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (activeDialog) return;
    const trigger = event.currentTarget as HTMLElement;
    const body = document.createElement('div');
    const root = createRoot(body);
    const dialog = new InfoDialog({ classes: 'dialog--problem-record-picker', width: '42rem', $body: body, $action: '' });
    activeDialog = dialog;
    dialog.$dom.find('.dialog__content').attr({
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'problem-record-picker-title',
      'aria-describedby': 'problem-record-picker-description',
    });
    dialog.$dom.on('keydown.problemRecordPicker', (keyboardEvent) => {
      if (keyboardEvent.key !== 'Tab') return;
      const buttons = dialog.$dom.find('button:not(:disabled)').toArray();
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault();
        last?.focus();
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault();
        first?.focus();
      }
    });
    dialog.$dom.one('vjDomDialogHidden', () => {
      root.unmount();
      activeDialog = null;
      trigger.focus();
    });
    root.render(<ProblemRecordPicker url={config.url} initialAccepted={trigger.dataset.problemRecordPicker === 'accepted'} />);
    dialog.open();
  });
}
