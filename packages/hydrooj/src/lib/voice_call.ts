/** Voice frames are ephemeral 16 kHz mono G.711 μ-law, 40 ms per frame. */
export const VOICE_FRAME_BYTES = 640;
export const VOICE_MAX_MESSAGE_BYTES = 2048;
export const VOICE_RING_MS = 45_000;
export const VOICE_PRESENCE_MS = 30_000;
export const VOICE_RECONNECT_MS = 20_000;
export const VOICE_LEASE_MS = 40_000;
export const VOICE_FRAME_MAX_AGE_MS = 300;

export class VoiceCallError extends Error {
    constructor(public code: string, message: string) { super(message); }
}

export interface VoiceOwner { tabId: string; deviceId: string; connectionId: string }
export interface VoiceCall {
    _id: string; participantUids: number[]; teacherUid: number; studentUid: number; dialRequestId?: string;
    teacherName: string; studentName: string; domainId: string; workspaceId: string; serverId: string;
    teacherOwner: VoiceOwner; studentOwner?: VoiceOwner;
    status: 'ringing' | 'active'; active: boolean; createdAt: Date; acceptedAt?: Date;
    ringExpiresAt: Date; expiresAt: Date; disconnectedAt?: Date;
}

export function voiceId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

export function validateVoiceMessage(value: any) {
    const invalid = () => { throw new VoiceCallError('INVALID_MESSAGE', '语音消息格式不正确。'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const fields: Record<string, string[]> = {
        hello: ['type', 'tabId', 'deviceId', 'visible', 'mediaOwner'], pulse: ['type', 'visible'], list: ['type'],
        dial: ['type', 'studentUid', 'requestId'], accept: ['type', 'callId'], reject: ['type', 'callId'], hangup: ['type', 'callId'],
        audio: ['type', 'callId', 'seq', 'data'],
    };
    if (!Object.hasOwn(fields, value.type) || Object.keys(value).some((key) => !fields[value.type].includes(key))) invalid();
    if (value.type === 'hello' && (!voiceId(value.tabId) || !voiceId(value.deviceId)
        || typeof value.visible !== 'boolean' || (value.mediaOwner !== undefined && typeof value.mediaOwner !== 'boolean'))) invalid();
    if (value.type === 'pulse' && value.visible !== undefined && typeof value.visible !== 'boolean') invalid();
    if (value.type === 'dial' && (!Number.isSafeInteger(value.studentUid) || value.studentUid <= 1)) invalid();
    if (value.type === 'dial' && value.requestId !== undefined && !voiceId(value.requestId)) invalid();
    if (['accept', 'reject', 'hangup', 'audio'].includes(value.type) && !voiceId(value.callId)) invalid();
    if (value.type === 'audio' && (!Number.isSafeInteger(value.seq) || value.seq < 0
        || typeof value.data !== 'string' || value.data.length !== 856 || !/^[A-Za-z0-9+/]{854}==$/.test(value.data)
        || Buffer.from(value.data, 'base64').length !== VOICE_FRAME_BYTES
        || Buffer.from(value.data, 'base64').toString('base64') !== value.data)) invalid();
}

export function voiceRole(call: VoiceCall, uid: number): 'teacher' | 'student' | null {
    return call.teacherUid === uid ? 'teacher' : call.studentUid === uid ? 'student' : null;
}

export function ownsVoice(call: VoiceCall, peer: VoiceOwner & { uid: number; mediaOwner: boolean }) {
    const role = voiceRole(call, peer.uid);
    const owner = role && call[`${role}Owner`];
    return !!(peer.mediaOwner && owner && owner.tabId === peer.tabId && owner.deviceId === peer.deviceId
        && owner.connectionId === peer.connectionId);
}

/** Audio has a separate budget so a burst never blocks hanging up. */
export class VoiceRateLimit {
    private audioTokens = 12;
    private audioAt = 0;
    private controls: number[] = [];
    accept(type: string, now = Date.now()) {
        if (type === 'audio') {
            this.audioTokens = Math.min(12, this.audioTokens + Math.max(0, now - this.audioAt) * 0.03);
            this.audioAt = now;
            if (this.audioTokens < 1) return false;
            this.audioTokens -= 1;
            return true;
        }
        this.controls = this.controls.filter((time) => now - time < 10_000);
        if (this.controls.length >= 40) throw new VoiceCallError('RATE_LIMIT', '操作太快，请稍后再试。');
        this.controls.push(now);
        return true;
    }
}
