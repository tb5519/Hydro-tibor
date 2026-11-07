import { createHash } from 'crypto';
import { LIVE_SHARE_MAX_BYTES, LiveShareError, shareId, validateRelayData } from './live_share';

export const BROADCAST_MAX_STUDENTS = 30;
export type BroadcastKind = 'mirror' | 'editor' | 'drawing' | 'annotation';

export function validateBroadcastMessage(value: any) {
    const fail = () => { throw new LiveShareError('INVALID_BROADCAST', '分享内容格式不正确。'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Buffer.byteLength(JSON.stringify(value)) > LIVE_SHARE_MAX_BYTES) fail();
    const fields = {
        'broadcast:start': ['type', 'studentUids'],
        'broadcast:stop': ['type', 'sessionId'],
        'broadcast:sync': ['type', 'sessionId', 'pageId'],
        'broadcast:relay': ['type', 'sessionId', 'pageId', 'kind', 'data'],
    };
    if (!Object.hasOwn(fields, value.type) || Object.keys(value).some((key) => !fields[value.type].includes(key))) fail();
    if (value.type === 'broadcast:start') {
        if (!Array.isArray(value.studentUids) || !value.studentUids.length || value.studentUids.length > BROADCAST_MAX_STUDENTS
            || !value.studentUids.every((uid) => Number.isSafeInteger(uid) && uid > 1)
            || new Set(value.studentUids).size !== value.studentUids.length) fail();
    } else if (!shareId(value.sessionId)) fail();
    if (['broadcast:sync', 'broadcast:relay'].includes(value.type) && !shareId(value.pageId)) fail();
    if (value.type === 'broadcast:relay' && (!['mirror', 'editor', 'drawing', 'annotation'].includes(value.kind)
        || !value.data || typeof value.data !== 'object' || Array.isArray(value.data))) fail();
}

/** A viewer can send ink only: no arbitrary command or CRDT write is ever forwarded. */
export function validateBroadcastRelay(teacher: boolean, kind: BroadcastKind, data: any, pageId: string) {
    if (!teacher && kind !== 'drawing') throw new LiveShareError('FORBIDDEN', '观看分享时只能使用临时画笔。');
    if (kind === 'mirror' || kind === 'editor') validateRelayData('student', kind, data, pageId);
    else if (kind === 'annotation') {
        if (data.action !== 'annotate') throw new LiveShareError('INVALID_RELAY', '分享标注格式不正确。');
        validateRelayData('teacher', 'command', data, pageId);
    } else if (kind === 'drawing') {
        if (!teacher && (!['start', 'move', 'end'].includes(data.phase) || Object.hasOwn(data, 'note'))) {
            throw new LiveShareError('FORBIDDEN', '学员画笔会自动消失，不能添加标签。');
        }
        validateRelayData('teacher', 'command', {
            id: 'broadcast-drawing', nodeId: 1, pageId, action: 'draw', drawing: data,
        }, pageId);
    } else throw new LiveShareError('INVALID_RELAY', '无法识别分享内容。');
}

/** Namespacing both sides keeps an authenticated student from guessing a teacher's stroke id. */
export function broadcastDrawing(uid: number, data: any) {
    return { ...data, strokeId: `broadcast-${uid}-${createHash('sha256').update(data.strokeId).digest('hex').slice(0, 32)}` };
}
