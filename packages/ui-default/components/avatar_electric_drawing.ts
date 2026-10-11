export interface ElectricArcOptions {
  size?: number;
  power?: number;
  sparks?: boolean;
}

// The approved 游走电弧 design, drawn around an unchanged portrait (radius 50).
export function drawElectricAvatarArc(ctx: CanvasRenderingContext2D, t: number, opts: ElectricArcOptions = {}) {
  opts = opts || {};
  let small = (opts.size || 96) < 54;
  let power = Math.max(0.35, Math.min(1.5, opts.power == null ? 1 : opts.power));
  let tau = Math.PI * 2;
  let clamp = function (x) { return Math.max(0, Math.min(1, x)); };
  let smooth = function (x) { return x * x * (3 - 2 * x); };
  let hash = function (n) {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };
  let noise = function (x, seed) {
    let i = Math.floor(x);
    let f = smooth(x - i);
    return hash(i + seed) * (1 - f) + hash(i + 1 + seed) * f;
  };
  let point = function (a, r) { return [Math.cos(a) * r, Math.sin(a) * r]; };
  let path = function (points) {
    ctx.beginPath();
    for (let j = 0; j < points.length; j++) {
      if (j) ctx.lineTo(points[j][0], points[j][1]);
      else ctx.moveTo(points[j][0], points[j][1]);
    }
  };
  let electricStroke = function (points, alpha, strength) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha * power;
    path(points);
    ctx.strokeStyle = 'rgba(0,97,255,0.20)';
    ctx.lineWidth = strength * 5.8;
    ctx.shadowColor = '#177dff';
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.strokeStyle = '#288bff';
    ctx.lineWidth = strength * 2.5;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.strokeStyle = '#e5fdff';
    ctx.lineWidth = strength * 0.87;
    ctx.shadowColor = '#9feeff';
    ctx.shadowBlur = 2;
    ctx.stroke();
    ctx.restore();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // A thin charged atmosphere leaves the portrait itself completely clear.
  let halo = ctx.createRadialGradient(0, 0, 50, 0, 0, 76);
  halo.addColorStop(0, 'rgba(5,128,255,0)');
  halo.addColorStop(0.21, 'rgba(20,130,255,0.18)');
  halo.addColorStop(0.48, 'rgba(40,147,255,0.08)');
  halo.addColorStop(1, 'rgba(10,100,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, tau);
  ctx.fill();

  // Three incomplete rotating circuit tracks, rather than a solid neon border.
  ctx.lineCap = 'round';
  for (let ring = 0; ring < 2; ring++) {
    let radius = 54.7 + ring * 4.6;
    let rotation = t * (ring === 1 ? -0.19 : 0.13) + ring * 1.7;
    let tracks = ring === 0 ? 3 : (small ? 2 : 4);
    for (let k = 0; k < tracks; k++) {
      let start = rotation + k * tau / tracks;
      let length = ring === 0 ? 0.84 : (ring === 1 ? 0.52 : 0.31);
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, start + length);
      ctx.lineWidth = ring === 0 ? 1.3 : 0.8;
      ctx.strokeStyle = ring === 0 ? 'rgba(71,168,255,0.68)' : 'rgba(47,136,242,0.42)';
      ctx.stroke();
      let p = point(start + length, radius);
      ctx.fillStyle = '#a5f8ff';
      ctx.beginPath();
      ctx.arc(p[0], p[1], ring === 0 ? 1.25 : 0.85, 0, tau);
      ctx.fill();
    }
  }

  // Sparse machine-like index marks are quiet enough to survive at list size.
  let ticks = small ? 4 : 8;
  for (let tick = 0; tick < ticks; tick++) {
    let angle = tick * tau / ticks + t * 0.075;
    if (tick % 5 === 3) continue;
    let inner = tick % 3 === 0 ? 65 : 66;
    let outer = inner + (tick % 3 === 0 ? 3.2 : 1.7);
    let p0 = point(angle, inner);
    let p1 = point(angle, outer);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineWidth = tick % 3 === 0 ? 1.2 : 0.65;
    ctx.strokeStyle = tick % 3 === 0 ? 'rgba(70,159,255,0.75)' : 'rgba(54,123,220,0.40)';
    ctx.stroke();
  }

  // Smooth deterministic drift moves each zigzag continuously. Long arcs take
  // turns energising, so nothing flickers or flashes across the whole avatar.
  let arcCount = small ? 3 : 4;
  for (let a = 0; a < arcCount; a++) {
    let phase = t * 0.48 + a * 0.83;
    let breath = 0.42 + 0.58 * Math.pow((Math.sin(phase * 2.1) + 1) / 2, 1.8);
    let startAngle = a * tau / arcCount + t * (a % 2 ? -0.14 : 0.12) + Math.sin(t * 0.52 + a) * 0.16;
    let arcLength = small ? 0.92 : 1.16 + hash(a + 24) * 0.28;
    let segments = small ? 7 : 12;
    let points = [];
    for (let s = 0; s <= segments; s++) {
      let ratio = s / segments;
      let taper = Math.sin(Math.PI * ratio);
      let jag = (noise(t * 1.15 + s * 0.77, a * 43 + 9) - 0.5) * 10.2;
      let radial = 58 + jag * taper + Math.sin(t * 0.83 + a) * 1.1;
      points.push(point(startAngle + ratio * arcLength, radial));
    }
    electricStroke(points, breath * 0.83, small ? 1.2 : 1.05 + hash(a + 6) * 0.2);

    if (!small && a % 2 === 0) {
      let branchIndex = 4 + a % 3;
      let root = points[branchIndex];
      let branchAngle = startAngle + arcLength * branchIndex / segments;
      let bend = point(branchAngle + 0.07, 65.3);
      let end = point(branchAngle + 0.01, 70.3 + hash(a + 80) * 3.6);
      electricStroke([root, bend, point(branchAngle + 0.11, 68.1), end], breath * 0.48, 0.55);
    }
  }

  // A pair of angular electrode brackets gives this style its distinct tech
  // silhouette; both stay close to the avatar in dense leaderboard rows.
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.translate(side * 63, 0);
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(-2, -16);
    ctx.lineTo(4, -10);
    ctx.lineTo(4, 10);
    ctx.lineTo(-2, 16);
    ctx.strokeStyle = 'rgba(39,125,240,0.73)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7.5, -5);
    ctx.lineTo(7.5, 5);
    ctx.strokeStyle = '#70ddff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  if (opts.sparks !== false) {
    let sparks = small ? 3 : 7;
    for (let particle = 0; particle < sparks; particle++) {
      let life = (t * (0.22 + hash(particle + 44) * 0.12) + hash(particle + 119)) % 1;
      let alpha = Math.sin(life * Math.PI) * 0.72;
      let angleP = particle * 2.39996 + t * 0.17;
      let radialP = 64 + life * 10;
      let pp = point(angleP, radialP);
      let lengthP = 1.1 + (1 - life) * 1.1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#40a7ff';
      ctx.lineWidth = small ? 1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(pp[0] - lengthP, pp[1]);
      ctx.lineTo(pp[0] + lengthP, pp[1]);
      ctx.moveTo(pp[0], pp[1] - lengthP);
      ctx.lineTo(pp[0], pp[1] + lengthP);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
