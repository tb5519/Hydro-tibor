import { IdeSnapshot } from './types';
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const number = (value: any, max = 1000000) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const string = (value: any, max: number) => typeof value === 'string' && value.length <= max;
const id = (value: any) => Number.isSafeInteger(value) && value > 0;
const color = (value: any, empty = false) => typeof value === 'string'
  && ((empty && !value) || /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{1,32})$/i.test(value));
const points = (value: any, max: number) => Array.isArray(value) && value.length > 0 && value.length <= max
  && value.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => number(v)));
function primitive(c: any) {
  if (!object(c) || !id(c.id) || !id(c.turtle)) return false;
  if (c.op === 'line') return [c.x1, c.y1, c.x2, c.y2].every((v) => number(v)) && color(c.color) && number(c.width, 100) && c.width >= 0;
  if (c.op === 'polygon') return points(c.points, 2048) && color(c.fill, true) && color(c.stroke, true) && number(c.width, 100) && c.width >= 0;
  if (c.op === 'dot') return number(c.x) && number(c.y) && number(c.size, 1000) && c.size > 0 && color(c.color);
  if (c.op === 'text') return number(c.x) && number(c.y) && string(c.text, 8192) && color(c.color)
    && ['left', 'center', 'right'].includes(c.align) && Array.isArray(c.font) && c.font.length === 3
    && string(c.font[0], 128) && number(c.font[1], 128) && c.font[1] >= 1 && string(c.font[2], 64);
  return false;
}
/** Shared snapshots arrive from another browser; validate before creating any DOM/SVG nodes. */
export function isValidIdeSnapshot(s: any): s is IdeSnapshot {
  if (!object(s) || s.version !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0
    || !string(s.runId, 80) || (s.runId && !/^[a-zA-Z0-9_-]{16,80}$/.test(s.runId))
    || !['idle', 'connecting', 'starting', 'compiling', 'running', 'waiting-input', 'stopping', 'finished', 'disconnected'].includes(s.state)
    || typeof s.ready !== 'boolean' || typeof s.inputPending !== 'boolean' || !string(s.inputDraft, 16000)
    || !Number.isSafeInteger(s.inputErrorSeq) || s.inputErrorSeq < 0 || !string(s.message, 4096)
    || !['terminal', 'graphics'].includes(s.activeWindow) || !object(s.windows)) return false;
  for (const name of ['terminal', 'graphics']) {
    const w = s.windows[name];
    if (!object(w) || ['visible', 'minimized', 'maximized'].some((key) => typeof w[key] !== 'boolean')
      || !['x', 'y'].every((key) => number(w[key], 1) && w[key] >= 0)
      || !number(w.width, 1600) || w.width < 280 || !number(w.height, 1200) || w.height < 160) return false;
  }
  if (!Array.isArray(s.output) || s.output.length > 12000 || s.output.some((part: any) => !object(part)
    || !['stdout', 'stderr', 'stdin', 'notice'].includes(part.stream) || !string(part.text, 100000))
    || s.output.reduce((sum: number, part: any) => sum + part.text.length, 0) > 100000) return false;
  const screen = s.screen;
  if (!object(screen) || ![screen.width, screen.height].every((n) => number(n, 1600) && n >= 64)
    || !color(screen.bg) || !string(screen.title, 256)
    || (screen.world !== undefined && (!Array.isArray(screen.world) || screen.world.length !== 4
      || !screen.world.every((n) => number(n)) || screen.world[0] >= screen.world[2] || screen.world[1] >= screen.world[3]))) return false;
  if (!Array.isArray(s.primitives) || !Array.isArray(s.turtles) || s.primitives.length + s.turtles.length > 12000
    || !s.primitives.every(primitive) || new Set(s.primitives.map((item: any) => item.id)).size !== s.primitives.length) return false;
  if (!s.turtles.every((c: any) => object(c) && c.op === 'turtle' && id(c.id) && number(c.x) && number(c.y)
    && number(c.heading) && typeof c.visible === 'boolean' && string(c.shape, 64) && color(c.pencolor) && color(c.fillcolor)
    && Array.isArray(c.scale) && c.scale.length === 2 && c.scale.every((n) => number(n, 100) && n > 0)
    && number(c.outline, 100) && c.outline >= 0)) return false;
  if (!object(s.shapes) || Object.keys(s.shapes).length > 30000
    || !Object.entries(s.shapes).every(([name, value]) => name.length <= 64 && points(value, 256))) return false;
  const r = s.request;
  if (r !== null && (!object(r) || r.op !== 'request' || !id(r.id) || !['text', 'number'].includes(r.kind)
    || !string(r.title, 256) || !string(r.prompt, 4096)
    || (r.draft !== undefined && !string(r.draft, 4096))
    || ['default', 'min', 'max'].some((key) => r[key] !== undefined && r[key] !== null && !number(r[key])))) return false;
  try { return JSON.stringify(s).length <= 4 * 1024 * 1024; } catch { return false; }
}
