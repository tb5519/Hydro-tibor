import { CHAT_CODE_BYTES, ClassChatError } from './class_chat';

interface SolutionMark {
    id: string; start: number; end: number; quote: string; text: string; noteOpen: boolean;
    offsetX: number; offsetY: number; width?: number; height?: number;
}
export interface ChatSolutionAnnotations {
    version: 1;
    text: (SolutionMark & { key: string })[];
    code: (SolutionMark & { editorId: string })[];
    ink: {
        id: string;
        anchor: { kind: 'element'; key: string; path: number[] } | { kind: 'editor'; editorId: string };
        reference: number[];
        points: number[][];
        note?: { text: string; x: number; y: number; width: number; height: number };
    }[];
}
export interface ChatSolutionContent { code: string; lang: string; annotations: ChatSolutionAnnotations }
export const CHAT_SOLUTION_ANNOTATION_BYTES = 256 * 1024;
export const emptyChatSolutionAnnotations = (): ChatSolutionAnnotations => ({ version: 1, text: [], code: [], ink: [] });
const boundedNumber = (value: any, max = 10000) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const markId = (value: any) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(value);

export function validateChatSolution(value: any): ChatSolutionContent {
    const invalid = () => { throw new ClassChatError('INVALID_SOLUTION', '讲解内容过大或不完整，请刷新后重试。'); };
    const notes = value?.annotations;
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.code !== 'string' || value.code.includes('\0') || Buffer.byteLength(value.code) > CHAT_CODE_BYTES
        || typeof value.lang !== 'string' || value.lang.length > 64 || notes?.version !== 1
        || !Array.isArray(notes.text) || notes.text.length > 40
        || !Array.isArray(notes.code) || notes.code.length > 40
        || !Array.isArray(notes.ink) || notes.ink.length > 32
        || Buffer.byteLength(JSON.stringify(notes)) > CHAT_SOLUTION_ANNOTATION_BYTES) invalid();
    const ids = new Set<string>();
    const id = (value: any) => {
        if (!markId(value) || ids.has(value)) invalid();
        ids.add(value);
        return value as string;
    };
    const mark = (item: any): SolutionMark => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || ![item.start, item.end].every((offset) => Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000)
            || item.start >= item.end || typeof item.quote !== 'string' || !item.quote || item.quote.length > 10000
            || typeof item.text !== 'string' || item.text.length > 1000 || typeof item.noteOpen !== 'boolean'
            || ![item.offsetX, item.offsetY].every((offset) => boundedNumber(offset))
            || (item.width !== undefined && (!boundedNumber(item.width, 960) || item.width < 36))
            || (item.height !== undefined && (!boundedNumber(item.height, 800) || item.height < 36))) invalid();
        return { id: id(item.id), start: item.start, end: item.end, quote: item.quote, text: item.text,
            noteOpen: item.noteOpen, offsetX: item.offsetX, offsetY: item.offsetY,
            ...(item.width !== undefined ? { width: item.width } : {}), ...(item.height !== undefined ? { height: item.height } : {}) };
    };
    const text = notes.text.map((item: any) => {
        if (item?.key !== 'statement') invalid();
        return { ...mark(item), key: item.key };
    });
    const code = notes.code.map((item: any) => {
        if (item?.editorId !== 'code' || item.end > value.code.length || value.code.slice(item.start, item.end) !== item.quote) invalid();
        return { ...mark(item), editorId: item.editorId };
    });
    const ink = notes.ink.map((item: any) => {
        const anchor = item?.anchor;
        if (!markId(item?.id) || item.id.length < 8 || !anchor || !['element', 'editor'].includes(anchor.kind)
            || !Array.isArray(item.reference) || item.reference.length !== 6
            || !item.reference.every((entry, i) => boundedNumber(entry, i < 4 ? 100 : 1e7))
            || Math.abs(item.reference[0] * item.reference[3] - item.reference[1] * item.reference[2]) < 1e-6
            || !Array.isArray(item.points) || !item.points.length || item.points.length > 2048
            || item.points.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every((entry) => boundedNumber(entry) && entry >= 0))) invalid();
        let target: ChatSolutionAnnotations['ink'][number]['anchor'];
        if (anchor.kind === 'element') {
            if (!['statement', '$root'].includes(anchor.key) || !Array.isArray(anchor.path) || anchor.path.length > 24
                || anchor.path.some((part) => !Number.isSafeInteger(part) || part < 0 || part > 20000)) invalid();
            target = { kind: 'element', key: anchor.key, path: [...anchor.path] };
        } else {
            if (anchor.editorId !== 'code') invalid();
            target = { kind: 'editor', editorId: 'code' };
        }
        const note = item.note;
        if (note !== undefined && (!note || typeof note.text !== 'string' || note.text.length > 1000
            || ![note.x, note.y].every((entry) => boundedNumber(entry) && entry >= 0)
            || !boundedNumber(note.width, 960) || note.width < 36
            || !boundedNumber(note.height, 800) || note.height < 36)) invalid();
        return { id: id(item.id), anchor: target, reference: [...item.reference], points: item.points.map((point) => [...point]),
            ...(note ? { note: { text: note.text, x: note.x, y: note.y, width: note.width, height: note.height } } : {}) };
    });
    return { code: value.code, lang: value.lang, annotations: { version: 1, text, code, ink } };
}
