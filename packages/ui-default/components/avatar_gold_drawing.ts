export interface AvatarCornerRadius {
  x: number;
  y: number;
}

export interface GoldAvatarOptions {
  width: number;
  height: number;
  /** CSS-normalized radii in top-left, top-right, bottom-right, bottom-left order. */
  radii: [AvatarCornerRadius, AvatarCornerRadius, AvatarCornerRadius, AvatarCornerRadius];
}

export const GOLD_AVATAR_PADDING = 6;

const TAU = Math.PI * 2;
const GOLD_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#9d6b2520'], [30, '#bf8d3c55'], [65, '#edbd66cc'], [90, '#ffe7a9'],
  [103, '#fff9e4'], [116, '#edbc58'], [136, '#b8883430'], [175, '#b8883410'],
  [205, '#c08b3a40'], [243, '#eebf69c4'], [265, '#fff1c6'], [279, '#ffda79'],
  [302, '#a26d2120'], [360, '#9d6b2520'],
];

/** Append a parallel outline; its corner centers stay aligned with the portrait. */
function outline(ctx: CanvasRenderingContext2D, opts: GoldAvatarOptions, outset: number) {
  const left = -outset;
  const top = -outset;
  const right = opts.width + outset;
  const bottom = opts.height + outset;
  const [tl, tr, br, bl] = opts.radii.map(({ x, y }) => ({ x: x + outset, y: y + outset }));
  const corner = (cx: number, cy: number, radius: AvatarCornerRadius, start: number, end: number) => {
    if (radius.x > 0 && radius.y > 0) ctx.ellipse(cx, cy, radius.x, radius.y, 0, start, end);
    else ctx.lineTo(cx + Math.cos(end) * radius.x, cy + Math.sin(end) * radius.y);
  };
  ctx.moveTo(left + tl.x, top);
  ctx.lineTo(right - tr.x, top);
  corner(right - tr.x, top + tr.y, tr, -Math.PI / 2, 0);
  ctx.lineTo(right, bottom - br.y);
  corner(right - br.x, bottom - br.y, br, 0, Math.PI / 2);
  ctx.lineTo(left + bl.x, bottom);
  corner(left + bl.x, bottom - bl.y, bl, Math.PI / 2, Math.PI);
  ctx.lineTo(left, top + tl.y);
  corner(left + tl.x, top + tl.y, tl, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Paint only the border outside a portrait whose top-left corner is (0, 0). */
export function drawGoldAvatarBorder(ctx: CanvasRenderingContext2D, t: number, opts: GoldAvatarOptions) {
  if (!Number.isFinite(opts.width) || !Number.isFinite(opts.height) || opts.width <= 0 || opts.height <= 0) return;
  const lineWidth = Math.min(opts.width, opts.height) <= 54 ? 1.8 : 2.4;
  const angle = ((Number.isFinite(t) ? t : 0) % 4.8) / 4.8 * TAU - Math.PI / 2;
  const cx = opts.width / 2;
  const cy = opts.height / 2;
  // The fallback keeps the same two gold highlights on older canvas implementations.
  const gradient = typeof ctx.createConicGradient === 'function'
    ? ctx.createConicGradient(angle, cx, cy)
    : ctx.createLinearGradient(
      cx - Math.cos(angle) * cx, cy - Math.sin(angle) * cy,
      cx + Math.cos(angle) * cx, cy + Math.sin(angle) * cy,
    );
  GOLD_STOPS.forEach(([degrees, color]) => gradient.addColorStop(degrees / 360, color));

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // Keep the image completely untouched, including transparent portraits and rounded corners.
  ctx.beginPath();
  ctx.rect(-GOLD_AVATAR_PADDING, -GOLD_AVATAR_PADDING,
    opts.width + GOLD_AVATAR_PADDING * 2, opts.height + GOLD_AVATAR_PADDING * 2);
  outline(ctx, opts, 0);
  ctx.clip('evenodd');
  ctx.lineJoin = 'round';

  ctx.beginPath();
  outline(ctx, opts, 1.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#b78c46a0';
  ctx.stroke();

  ctx.beginPath();
  outline(ctx, opts, 0.5);
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#fff9e480';
  ctx.stroke();

  ctx.beginPath();
  outline(ctx, opts, 3 - lineWidth / 2);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = gradient;
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.shadowColor = '#edbc5899';
  ctx.shadowBlur = 2;
  ctx.stroke();
  ctx.restore();
  ctx.stroke();
  ctx.restore();
}
