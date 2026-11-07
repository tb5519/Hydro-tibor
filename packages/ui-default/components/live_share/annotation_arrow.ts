interface Rect { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }
interface Bounds { left: number; top: number; right: number; bottom: number }

function arrow(start: Point, end: Point) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const ux = (end.x - start.x) / length; const uy = (end.y - start.y) / length;
  const size = Math.min(1, length / 70);
  const points = [[0, -10 * size], [length - 30 * size, -10 * size], [length - 30 * size, -23 * size],
    [length, 0], [length - 30 * size, 23 * size], [length - 30 * size, 10 * size], [0, 10 * size]];
  const position = ([x, y]: number[]) => ({ x: start.x + x * ux - y * uy, y: start.y + x * uy + y * ux });
  const format = (point: number[]) => { const p = position(point); return `${p.x} ${p.y}`; };
  const corners = points.map((point, index) => {
    const before = points[(index + points.length - 1) % points.length]; const after = points[(index + 1) % points.length];
    const toward = (other: number[]) => {
      const distance = Math.hypot(other[0] - point[0], other[1] - point[1]);
      const ratio = Math.min((index === 0 || index === 6 ? 8 : 4) * size / distance, .45);
      return point.map((value, axis) => value + (other[axis] - value) * ratio);
    };
    return { before: toward(before), point, after: toward(after) };
  });
  const vertices = points.map(position);
  return {
    d: `M ${format(corners[0].before)} ${corners.map((corner) => `L ${format(corner.before)} Q ${format(corner.point)} ${format(corner.after)}`).join(' ')} Z`,
    // Every rounded corner is inside this hull. Include the outline and shadow
    // when checking room, not just the line between the arrow's endpoints.
    bounds: { left: Math.min(...vertices.map((p) => p.x)) - 4, right: Math.max(...vertices.map((p) => p.x)) + 4,
      top: Math.min(...vertices.map((p) => p.y)) - 4, bottom: Math.max(...vertices.map((p) => p.y)) + 6 },
  };
}

/** Keep the entire chunky arrow outside the focus, including at editor edges. */
export function placeAnnotationArrow(lines: Rect[], width: number, height: number): { d: string; bounds: Bounds } | null {
  if (!lines.length || width <= 0 || height <= 0) return null;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const focus = {
    left: Math.min(...lines.map((line) => line.x)) - 6,
    right: Math.max(...lines.map((line) => line.x + line.width)) + 6,
    top: Math.min(...lines.map((line) => line.y)) - 5,
    bottom: Math.max(...lines.map((line) => line.y + line.height)) + 5,
  };
  const top = lines.reduce((a, b) => a.y <= b.y ? a : b);
  const bottom = lines.reduce((a, b) => a.y + a.height >= b.y + b.height ? a : b);
  const left = lines.reduce((a, b) => a.x <= b.x ? a : b);
  const right = lines.reduce((a, b) => a.x + a.width >= b.x + b.width ? a : b);
  const centerX = (line: Rect) => clamp(line.x + Math.min(22, line.width / 3), 8, width - 8);
  const centerY = (line: Rect) => clamp(line.y + line.height / 2, 8, height - 8);
  const candidates = [
    { end: { x: centerX(top), y: focus.top - 9 }, directions: [[-.73, -.68], [.73, -.68], [0, -1]] },
    { end: { x: focus.left - 9, y: centerY(left) }, directions: [[-.73, -.68], [-1, 0], [-.73, .68]] },
    { end: { x: focus.right + 9, y: centerY(right) }, directions: [[.73, -.68], [1, 0], [.73, .68]] },
    { end: { x: centerX(bottom), y: focus.bottom + 9 }, directions: [[-.73, .68], [.73, .68], [0, 1]] },
  ];
  for (const length of [85, 68, 52, 38, 26, 18]) {
    for (const { end, directions } of candidates) {
      for (const [dx, dy] of directions) {
        const result = arrow({ x: end.x + dx * length, y: end.y + dy * length }, end);
        const b = result.bounds;
        if (b.left < 2 || b.top < 2 || b.right > width - 2 || b.bottom > height - 2) continue;
        if (b.right > focus.left && b.left < focus.right && b.bottom > focus.top && b.top < focus.bottom) continue;
        return result;
      }
    }
  }
  // A focus filling the whole viewport leaves no honest place for an arrow.
  // Keep its outline visible instead of drawing over the learner's content.
  return null;
}
