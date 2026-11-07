/** The interactive IDE has its own execution pool; these are never Judge jobs. */
export const IDE_LIMITS = {
    codeBytes: 128 * 1024, inputBytes: 16 * 1024, wallSeconds: 1800, cpuSeconds: 30,
    executionSeconds: 120, inputIdleSeconds: 300,
    memoryBytes: 128 * 1024 * 1024, outputBytes: 2 * 1024 * 1024,
    graphicsBytes: 8 * 1024 * 1024, graphicsCommands: 30000, frameBytes: 64 * 1024,
};
export const IDE_LANGUAGES: Record<string, { family: 'python' | 'cpp' | 'c', standard?: string }> = {
    'py.py3': { family: 'python' }, py3: { family: 'python' },
    cc: { family: 'cpp', standard: 'c++17' },
    'cc.cc98': { family: 'cpp', standard: 'c++98' }, 'cc.cc11': { family: 'cpp', standard: 'c++11' },
    'cc.cc14': { family: 'cpp', standard: 'c++14' }, 'cc.cc17': { family: 'cpp', standard: 'c++17' },
    'cc.cc20': { family: 'cpp', standard: 'c++20' }, 'cc.cc23': { family: 'cpp', standard: 'c++23' },
    c: { family: 'c', standard: 'c99' },
};
export class IdeError extends Error {
    constructor(public code: string, message: string) { super(message); }
}
const invalid = () => { throw new IdeError('INVALID_MESSAGE', '运行请求格式不正确。'); };
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const string = (value: any, max: number) => typeof value === 'string' && value.length <= max;
const number = (value: any, max = 1000000) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const id = (value: any) => Number.isSafeInteger(value) && value > 0;
const color = (value: any, empty = false) => typeof value === 'string'
    && ((empty && !value) || /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{1,32})$/i.test(value));
const points = (value: any, min: number, max: number) => Array.isArray(value) && value.length >= min && value.length <= max
    && value.every((point) => Array.isArray(point) && point.length === 2 && point.every((n) => number(n)));
export const validRunId = (value: any) => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);

export function validateTurtleEvent(event: any) {
    if (!object(event) || Buffer.byteLength(JSON.stringify(event)) > IDE_LIMITS.inputBytes) invalid();
    if (event.type === 'close') return;
    if (event.type === 'click' && number(event.x) && number(event.y) && [1, 2, 3].includes(event.button)
        && (event.target === undefined || id(event.target))
        && (event.action === undefined || ['click', 'release', 'drag'].includes(event.action))) return;
    if (event.type === 'key' && string(event.key, 64) && ['down', 'up'].includes(event.action)) return;
    if (event.type === 'response' && id(event.id)
        && (event.value === null || string(event.value, 4096) || number(event.value, Number.MAX_SAFE_INTEGER))) return;
    invalid();
}
export function validateIdeMessage(value: any) {
    if (!object(value) || !validRunId(value.runId)) invalid();
    if (value.type === 'run') {
        if (!Object.hasOwn(IDE_LANGUAGES, value.lang) || !string(value.code, IDE_LIMITS.codeBytes)
            || Buffer.byteLength(value.code) > IDE_LIMITS.codeBytes) invalid();
        return;
    }
    if (value.type === 'stop') return;
    if (!Number.isSafeInteger(value.seq) || value.seq < 0) invalid();
    if (['input', 'input-draft'].includes(value.type) && string(value.text, IDE_LIMITS.inputBytes)
        && Buffer.byteLength(value.text) <= IDE_LIMITS.inputBytes && !value.text.includes('\0')) return;
    if (value.type === 'turtle-event') { validateTurtleEvent(value.event); return; }
    invalid();
}

/** fd 3 is writable by student code, so it is an untrusted protocol boundary. */
export function validateDrawing(command: any) {
    if (!object(command) || typeof command.op !== 'string') invalid();
    const c = command;
    const xy = () => number(c.x) && number(c.y);
    const width = () => number(c.width, 100) && c.width >= 0;
    switch (c.op) {
    case 'screen':
        if (![c.width, c.height].every((n) => number(n, 1600) && n >= 64) || !color(c.bg) || !string(c.title, 256)
            || !Array.isArray(c.world) || c.world.length !== 4 || !c.world.every((n) => number(n))
            || c.world[2] <= c.world[0] || c.world[3] <= c.world[1]) invalid();
        break;
    case 'line':
        if (!id(c.id) || !id(c.turtle) || ![c.x1, c.x2, c.y1, c.y2].every((n) => number(n)) || !color(c.color) || !width()) invalid();
        break;
    case 'polygon':
        if (!id(c.id) || !id(c.turtle) || !points(c.points, 1, 2048) || !color(c.fill, true) || !color(c.stroke, true) || !width()) invalid();
        break;
    case 'dot':
        if (!id(c.id) || !id(c.turtle) || !xy() || !number(c.size, 1000) || c.size <= 0 || !color(c.color)) invalid();
        break;
    case 'text':
        if (!id(c.id) || !id(c.turtle) || !xy() || !string(c.text, 8192) || !color(c.color)
            || !['left', 'center', 'right'].includes(c.align) || !Array.isArray(c.font) || c.font.length !== 3
            || !string(c.font[0], 128) || !number(c.font[1], 128) || c.font[1] < 1 || !string(c.font[2], 64)) invalid();
        break;
    case 'turtle':
        if (!id(c.id) || !xy() || !number(c.heading) || typeof c.visible !== 'boolean' || !string(c.shape, 64)
            || !color(c.pencolor) || !color(c.fillcolor) || !Array.isArray(c.scale) || c.scale.length !== 2
            || !c.scale.every((n) => number(n, 100) && n > 0) || !number(c.outline, 100) || c.outline < 0) invalid();
        break;
    case 'shape': if (!string(c.name, 64) || !points(c.points, 3, 256)) invalid(); break;
    case 'clear': if (c.turtle !== undefined && !id(c.turtle)) invalid(); break;
    case 'remove': if (!Array.isArray(c.ids) || c.ids.length > 4096 || !c.ids.every(id)) invalid(); break;
    case 'request':
        if (!id(c.id) || !['text', 'number'].includes(c.kind) || !string(c.title, 256) || !string(c.prompt, 4096)
            || ['default', 'min', 'max'].some((key) => c[key] !== undefined && c[key] !== null && !number(c[key]))) invalid();
        break;
    case 'update': case 'close': break;
    default: invalid();
    }
    return command;
}
export function parseGraphicsLine(line: string) {
    if (Buffer.byteLength(line) > IDE_LIMITS.frameBytes) invalid();
    let value: any;
    try { value = JSON.parse(line); } catch { invalid(); }
    if (!object(value)) invalid();
    if (value.type === 'draw') return { type: 'turtle', commands: [validateDrawing(value.command)] };
    if (value.type === 'input' && (value.prompt === undefined || string(value.prompt, 4096))) {
        return { type: 'input-request', prompt: value.prompt || '' };
    }
    if (value.type === 'input-end') return { type: 'input-end' };
    if (value.type === 'execution-wait' && typeof value.waiting === 'boolean') return { type: 'execution-wait', waiting: value.waiting };
    if (value.type === 'interaction-wait' && ['input', 'events'].includes(value.kind)) return { type: 'interaction-wait', kind: value.kind };
    if (value.type === 'interaction-end' && (value.temporary === undefined || typeof value.temporary === 'boolean')) {
        return { type: 'interaction-end', temporary: value.temporary === true };
    }
    return invalid();
}
