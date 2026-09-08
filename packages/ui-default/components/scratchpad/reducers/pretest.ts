import { STATUS, STATUS_TEXTS } from '@hydrooj/common';

const pendingStatuses = new Set([
  STATUS.STATUS_WAITING, STATUS.STATUS_FETCHED, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING,
]);

export interface PretestSummary {
  status: string;
  time?: number;
  memory?: number;
}

export interface PretestState {
  input: string;
  output: string;
  rid: string;
  summary: PretestSummary | null;
  awaitingRecordId: boolean;
  earlyRecords: Record<string, any>;
}

function normalizeRecordId(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') return `${value}`;
  if (value?.$oid) return `${value.$oid}`;
  if (value?.oid) return `${value.oid}`;
  if (typeof value?.toHexString === 'function') return value.toHexString();
  return '';
}

function getSubmitRecordId(payload: any): string {
  const candidates = [payload, payload?.data, payload?.data?.data, payload?.body,
    payload?.body?.data, payload?.response, payload?.response?.data];
  for (const candidate of candidates) {
    const rid = normalizeRecordId(candidate?.rid || candidate?.recordId || candidate?._id || candidate);
    if (rid) return rid;
  }
  return '';
}

function measurement(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function applyRecord(state: PretestState, rdoc: any): PretestState {
  const status = typeof rdoc.status === 'number' ? rdoc.status : Number.parseInt(rdoc.status, 10);
  const isRunning = pendingStatuses.has(status);
  const output: string[] = [];
  if (Array.isArray(rdoc.compilerTexts)) output.push(...rdoc.compilerTexts.filter((text) => typeof text === 'string'));
  const message = rdoc.testCases?.[0]?.message;
  if (typeof message === 'string') output.push(message);
  return {
    ...state,
    output: output.join('\n'),
    summary: {
      status: STATUS_TEXTS[status] || '状态未知',
      ...(!isRunning ? { time: measurement(rdoc.time), memory: measurement(rdoc.memory) } : {}),
    },
  };
}

export default function reducer(state: PretestState = {
  input: '',
  output: '',
  rid: '',
  summary: null,
  awaitingRecordId: false,
  earlyRecords: {},
}, action: any = {}): PretestState {
  if (action.type === 'SCRATCHPAD_PRETEST_DATA_CHANGE') {
    const { type, value } = action.payload;
    return type === 'input' ? { ...state, input: value } : state;
  }
  if (action.type === 'SCRATCHPAD_POST_PRETEST_PENDING') {
    return {
      ...state, output: '', rid: '', summary: { status: '正在运行…' },
      awaitingRecordId: true, earlyRecords: {},
    };
  }
  if (action.type === 'SCRATCHPAD_RECORDS_PUSH') {
    const rdoc = action.payload?.rdoc;
    const rid = normalizeRecordId(rdoc?._id);
    if (!rid) return state;
    if (rid === state.rid) return applyRecord(state, rdoc);
    if (state.awaitingRecordId) {
      // Fast judge updates can beat the HTTP response. Keep a bounded buffer,
      // and only display a record once the submit endpoint confirms its ID.
      const entries = Object.entries({ ...state.earlyRecords, [rid]: rdoc }).slice(-16);
      return { ...state, earlyRecords: Object.fromEntries(entries) };
    }
  }
  if (action.type === 'SCRATCHPAD_POST_PRETEST_FULFILLED') {
    const rid = getSubmitRecordId(action.payload);
    const nextState = {
      ...state, rid, awaitingRecordId: false, earlyRecords: {},
      summary: { status: rid ? '等待评测…' : '未能获取自测结果' },
    };
    return rid && state.earlyRecords[rid] ? applyRecord(nextState, state.earlyRecords[rid]) : nextState;
  }
  if (action.type === 'SCRATCHPAD_POST_PRETEST_REJECTED') {
    return {
      ...state, output: '', rid: '', awaitingRecordId: false,
      earlyRecords: {}, summary: { status: '提交失败' },
    };
  }
  return state;
}
