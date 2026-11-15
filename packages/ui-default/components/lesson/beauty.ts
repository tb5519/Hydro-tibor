export interface CameraBeautySettings { whitening: number; smoothing: number; eyeBrightening: number }
export interface CameraEyeRegion { x: number; y: number; radiusX: number; radiusY: number }

export const DEFAULT_TEACHER_BEAUTY: CameraBeautySettings = { whitening: 20, smoothing: 25, eyeBrightening: 20 };

export function normalizeBeautySettings(value: unknown): CameraBeautySettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const amount = (key: string, fallback: number) => typeof input[key] === 'number' && Number.isFinite(input[key])
    ? Math.max(0, Math.min(100, Math.round(input[key] as number))) : fallback;
  return { whitening: amount('whitening', 20), smoothing: amount('smoothing', 25), eyeBrightening: amount('eyeBrightening', 20) };
}


/** Conservative image-based eye detection, in unmirrored source coordinates.
 * A skin component only proposes a face. Both eyes must independently contain
 * dark detail with achromatic sclera on BOTH sides before any region is used. */
export function detectCameraEyes(pixels: ArrayLike<number>, width: number, height: number): CameraEyeRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 24
    || width > 192 || height > 144 || pixels.length < width * height * 4) return [];
  const size = width * height;
  const skin = new Uint8Array(size);
  const luminance = new Float32Array(size);
  const white = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    const r = pixels[index * 4] / 255; const g = pixels[index * 4 + 1] / 255; const b = pixels[index * 4 + 2] / 255;
    const y = .299 * r + .587 * g + .114 * b;
    const cb = .5 - .168736 * r - .331264 * g + .5 * b;
    const cr = .5 + .5 * r - .418688 * g - .081312 * b;
    luminance[index] = y;
    skin[index] = Number(y > .12 && y < .94 && cb > .27 && cb < .56 && cr > .525 && cr < .77 && r - b > .025);
    white[index] = Number(y > .43 && Math.max(r, g, b) - Math.min(r, g, b) < .14 && !skin[index]);
  }
  const queue = new Int32Array(size);
  const faces: Array<{ left: number; top: number; right: number; bottom: number; count: number; brightness: number }> = [];
  for (let start = 0; start < size; start++) {
    if (skin[start] !== 1) continue;
    let head = 0; let tail = 1; queue[0] = start; skin[start] = 2;
    let left = width; let top = height; let right = 0; let bottom = 0; let brightness = 0;
    while (head < tail) {
      const index = queue[head++]; const x = index % width; const y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      brightness += luminance[index];
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && skin[next] === 1) { skin[next] = 2; queue[tail++] = next; }
      }
    }
    const w = right - left + 1; const h = bottom - top + 1;
    if (tail >= size * .025 && w >= 18 && h >= 22 && w / h >= .44 && w / h <= 1.35 && tail / (w * h) >= .33) {
      faces.push({ left, top, right, bottom, count: tail, brightness: brightness / tail });
    }
  }
  faces.sort((a, b) => b.count - a.count);
  if (faces.length !== 1) return [];
  const face = faces[0]; const fw = face.right - face.left + 1; const fh = face.bottom - face.top + 1;
  const top = Math.ceil(face.top + fh * .12); const bottom = Math.floor(face.top + fh * .61);
  const left = Math.ceil(face.left + fw * .10); const right = Math.floor(face.right - fw * .10);
  const dark = new Uint8Array(size);
  const threshold = Math.min(.39, face.brightness * .72);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const index = y * width + x;
    if (luminance[index] < threshold) dark[index] = 1;
  }
  const candidates: Array<CameraEyeRegion & { score: number }> = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const start = y * width + x;
    if (dark[start] !== 1) continue;
    let head = 0; let tail = 1; queue[0] = start; dark[start] = 2;
    let minX = x; let maxX = x; let minY = y; let maxY = y;
    while (head < tail) {
      const index = queue[head++]; const px = index % width; const py = Math.floor(index / width);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx; const ny = py + dy; const next = ny * width + nx;
        if (nx >= left && nx <= right && ny >= top && ny <= bottom && dark[next] === 1) {
          dark[next] = 2; queue[tail++] = next;
        }
      }
    }
    const cw = maxX - minX + 1; const ch = maxY - minY + 1;
    if (tail < 2 || cw < fw * .025 || cw > fw * .24 || ch > fh * .13 || cw / ch < .40 || cw / ch > 7) continue;
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    const rx = Math.max(2, fw * .065, cw * .9); const ry = Math.max(1.5, fh * .035, ch * .7);
    let whites = 0; let whitesLeft = 0; let whitesRight = 0;
    let eyeLeft = minX; let eyeRight = maxX; let eyeTop = minY; let eyeBottom = maxY;
    for (let py = Math.max(top, Math.floor(cy - ry)); py <= Math.min(bottom, Math.ceil(cy + ry)); py++) {
      for (let px = Math.max(left, Math.floor(cx - rx)); px <= Math.min(right, Math.ceil(cx + rx)); px++) {
        if (!white[py * width + px]) continue;
        whites++; if (px < cx - .5) whitesLeft++; if (px > cx + .5) whitesRight++;
        eyeLeft = Math.min(eyeLeft, px); eyeRight = Math.max(eyeRight, px); eyeTop = Math.min(eyeTop, py); eyeBottom = Math.max(eyeBottom, py);
      }
    }
    if (whites < 3 || !whitesLeft || !whitesRight || eyeRight - eyeLeft > fw * .32 || eyeBottom - eyeTop > fh * .14) continue;
    // Require skin above and below the eye; image/background highlights at a
    // face boundary are insufficient evidence of an eye.
    let skinRing = 0; let ring = 0;
    for (const py of [Math.floor(eyeTop - 2), Math.ceil(eyeBottom + 2)]) {
      for (let px = Math.floor(eyeLeft); px <= Math.ceil(eyeRight); px++) {
        if (py < 0 || py >= height || px < 0 || px >= width) continue;
        ring++; if (skin[py * width + px]) skinRing++;
      }
    }
    if (!ring || skinRing / ring < .55) continue;
    candidates.push({ x: ((eyeLeft + eyeRight) / 2 + .5) / width, y: ((eyeTop + eyeBottom) / 2 + .5) / height,
      radiusX: (eyeRight - eyeLeft + 2) / (2 * width), radiusY: (eyeBottom - eyeTop + 2) / (2 * height), score: whites });
  }
  const pairs: Array<{ eyes: CameraEyeRegion[]; score: number }> = [];
  for (let first = 0; first < candidates.length; first++) for (let second = first + 1; second < candidates.length; second++) {
    const a = candidates[first]; const b = candidates[second];
    const dx = Math.abs(a.x - b.x) * width; const dy = Math.abs(a.y - b.y) * height;
    const center = (a.x + b.x) * width / 2;
    if (dx < fw * .23 || dx > fw * .70 || dy > Math.max(2, fh * .055)
      || Math.abs(center - (face.left + face.right) / 2) > fw * .12
      || Math.max(a.radiusX, b.radiusX) / Math.min(a.radiusX, b.radiusX) > 1.8
      || Math.max(a.radiusY, b.radiusY) / Math.min(a.radiusY, b.radiusY) > 2) continue;
    pairs.push({ eyes: [a, b].sort((one, two) => one.x - two.x), score: a.score + b.score - dy * 2 });
  }
  pairs.sort((a, b) => b.score - a.score);
  if (!pairs.length || (pairs[1] && pairs[1].score > pairs[0].score * .85)) return [];
  return pairs[0].eyes.map(({ x, y, radiusX, radiusY }) => ({ x, y, radiusX, radiusY }));
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_image;
uniform vec2 u_texel;
uniform float u_whitening;
uniform float u_smoothing;
uniform vec2 u_smoothing_radius;
uniform float u_smoothing_range;
uniform float u_eye_brightening;
uniform vec4 u_eye_left;
uniform vec4 u_eye_right;
varying vec2 v_uv;

float skinMask(vec3 color) {
  float y = dot(color, vec3(0.299, 0.587, 0.114));
  float cb = 0.5 + dot(color, vec3(-0.168736, -0.331264, 0.5));
  float cr = 0.5 + dot(color, vec3(0.5, -0.418688, -0.081312));
  float chroma = smoothstep(0.27, 0.33, cb) * (1.0 - smoothstep(0.52, 0.58, cb))
    * smoothstep(0.48, 0.53, cr) * (1.0 - smoothstep(0.71, 0.78, cr));
  float warmth = smoothstep(-0.04, 0.04, color.r - color.b);
  float exposure = smoothstep(0.025, 0.12, y) * (1.0 - smoothstep(0.92, 1.0, y));
  return clamp(chroma * warmth * exposure, 0.0, 1.0);
}

void addSample(vec2 offset, float radius, float spatialWeight, vec3 center, inout vec3 sum, inout float total) {
  vec3 neighbor = texture2D(u_image, v_uv + offset * u_texel * radius).rgb;
  vec3 difference = neighbor - center;
  float luminanceEdge = abs(dot(difference, vec3(0.299, 0.587, 0.114)));
  float edgeProtection = 1.0 - smoothstep(0.11, 0.27, luminanceEdge);
  float weight = spatialWeight * exp(-dot(difference, difference) * u_smoothing_range)
    * skinMask(neighbor) * edgeProtection;
  sum += neighbor * weight;
  total += weight;
}

float eyeMask(vec4 eye) {
  vec2 offset = (v_uv - eye.xy) / max(eye.zw, vec2(0.0001));
  return 1.0 - smoothstep(0.50, 1.0, dot(offset, offset));
}

void main() {
  vec3 center = texture2D(u_image, v_uv).rgb;
  float mask = skinMask(center);
  vec3 color = center;
  if (u_smoothing > 0.0) {
    vec3 sum = center;
    float total = 1.0;
    addSample(vec2(-1.0, -1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(0.0, -1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(1.0, -1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(-1.0, 0.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(1.0, 0.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(-1.0, 1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(0.0, 1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(1.0, 1.0), u_smoothing_radius.x, 1.0, center, sum, total);
    addSample(vec2(-1.0, -1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(0.0, -1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(1.0, -1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(-1.0, 0.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(1.0, 0.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(-1.0, 1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(0.0, 1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    addSample(vec2(1.0, 1.0), u_smoothing_radius.y, 0.65, center, sum, total);
    color = mix(center, sum / total, u_smoothing * sqrt(mask));
  }
  color += (vec3(1.0) - color) * color * (u_whitening * 0.5 * mask);
  if (u_eye_brightening > 0.0) {
    float y = dot(center, vec3(0.299, 0.587, 0.114));
    float chroma = max(max(center.r, center.g), center.b) - min(min(center.r, center.g), center.b);
    float sclera = smoothstep(0.40, 0.62, y) * (1.0 - smoothstep(0.10, 0.22, chroma));
    float eyes = max(eyeMask(u_eye_left), eyeMask(u_eye_right));
    color += (vec3(1.0) - color) * (0.40 * u_eye_brightening * sclera * eyes);
  }
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const RAW_STATUS = '摄像头美颜暂不可用，当前使用原画。';
const EYE_STATUS = '正在寻找双眼，识别后自动启用亮眼。';
interface BeautyOptions { now?: () => number; createAnalysisCanvas?: () => HTMLCanvasElement }

/** The caller displays and encodes this same GPU canvas; no CPU pixel pass is needed. */
export function createTeacherCameraBeauty(canvas: HTMLCanvasElement, onStatus?: (message: string) => void, options: BeautyOptions = {}) {
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let buffer: WebGLBuffer | null = null;
  let shaders: WebGLShader[] = [];
  let uniforms: { image: WebGLUniformLocation; texel: WebGLUniformLocation;
    whitening: WebGLUniformLocation; smoothing: WebGLUniformLocation;
    smoothingRadius: WebGLUniformLocation; smoothingRange: WebGLUniformLocation;
    eyeBrightening: WebGLUniformLocation; eyeLeft: WebGLUniformLocation; eyeRight: WebGLUniformLocation } | null = null;
  let disposed = false;
  let failed = false;
  let lost = false;
  let lastStatus = '';
  let analysisCanvas: HTMLCanvasElement | null = null;
  let analysisContext: CanvasRenderingContext2D | null = null;
  let lastDetectionAt = -Infinity;
  let trackedEyes: CameraEyeRegion[] = [];
  let trackedSource: HTMLVideoElement | null = null;
  let trackedWidth = 0; let trackedHeight = 0;
  let trackedStream: HTMLVideoElement['srcObject'] | undefined;
  let trackedTime = -1;
  const clock = options.now || (() => typeof performance !== 'undefined' ? performance.now() : Date.now());
  const clearEyes = () => { trackedEyes = []; lastDetectionAt = -Infinity; };
  function currentEyes(source: HTMLVideoElement, enabled: boolean) {
    if (!enabled) { clearEyes(); return []; }
    if (source !== trackedSource || source.videoWidth !== trackedWidth || source.videoHeight !== trackedHeight
      || source.srcObject !== trackedStream || (Number.isFinite(source.currentTime) && source.currentTime < trackedTime)) {
      clearEyes(); trackedSource = source; trackedWidth = source.videoWidth; trackedHeight = source.videoHeight; trackedStream = source.srcObject;
    }
    if (Number.isFinite(source.currentTime)) trackedTime = source.currentTime;
    const at = clock();
    if (!Number.isFinite(at)) { clearEyes(); return []; }
    if (at - lastDetectionAt < 0) clearEyes();
    if (at - lastDetectionAt < 250) return at - lastDetectionAt <= 350 ? trackedEyes : [];
    lastDetectionAt = at;
    try {
      if (!analysisCanvas) {
        analysisCanvas = options.createAnalysisCanvas?.() || canvas.ownerDocument?.createElement('canvas') || null;
        if (!analysisCanvas) return [];
        analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!analysisContext) { trackedEyes = []; return []; }
      const scale = Math.min(160 / source.videoWidth, 120 / source.videoHeight);
      const width = Math.round(source.videoWidth * scale);
      const height = Math.round(source.videoHeight * scale);
      if (width < 32 || height < 24) { trackedEyes = []; return []; }
      if (analysisCanvas.width !== width) analysisCanvas.width = width;
      if (analysisCanvas.height !== height) analysisCanvas.height = height;
      analysisContext.drawImage(source, 0, 0, width, height);
      trackedEyes = detectCameraEyes(analysisContext.getImageData(0, 0, width, height).data, width, height);
      return trackedEyes;
    } catch { trackedEyes = []; return []; }
  }
  function setEyeUniform(location: WebGLUniformLocation, eye?: CameraEyeRegion) {
    gl!.uniform4f(location, eye?.x || 0, eye ? 1 - eye.y : 0, eye?.radiusX || .0001, eye?.radiusY || .0001);
  }


  function status(message: string) {
    if (message === lastStatus || disposed) return;
    lastStatus = message;
    try { onStatus?.(message); } catch { /* UI status cannot interrupt camera delivery. */ }
  }
  function releaseResources() {
    if (gl) {
      const remove = (action: () => void) => { try { action(); } catch { /* Context may already be lost. */ } };
      if (texture) remove(() => gl!.deleteTexture(texture));
      if (buffer) remove(() => gl!.deleteBuffer(buffer));
      if (program) remove(() => gl!.deleteProgram(program));
      for (const shader of shaders) remove(() => gl!.deleteShader(shader));
    }
    program = null; texture = null; buffer = null; shaders = []; uniforms = null;
  }
  function fail() {
    releaseResources(); failed = true; status(RAW_STATUS);
  }
  function initialize() {
    try {
      const options: WebGLContextAttributes = { alpha: false, depth: false, stencil: false,
        antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true };
      gl = (canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options)) as WebGLRenderingContext | null;
      if (!gl || gl.isContextLost()) throw new Error('WebGL unavailable');
      const shader = (type: number, source: string) => {
        const value = gl!.createShader(type);
        if (!value) throw new Error('Unable to allocate camera shader');
        shaders.push(value); gl!.shaderSource(value, source); gl!.compileShader(value);
        if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) throw new Error('Unable to compile camera shader');
        return value;
      };
      const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) throw new Error('Unable to allocate camera program');
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Unable to link camera shader');
      gl.useProgram(program);
      buffer = gl.createBuffer(); texture = gl.createTexture();
      if (!buffer || !texture) throw new Error('Unable to allocate camera resources');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      if (position < 0) throw new Error('Camera position is unavailable');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      const uniform = (name: string) => {
        const value = gl!.getUniformLocation(program!, name);
        if (value === null) throw new Error('Camera parameter is unavailable');
        return value;
      };
      uniforms = { image: uniform('u_image'), texel: uniform('u_texel'),
        whitening: uniform('u_whitening'), smoothing: uniform('u_smoothing'),
        smoothingRadius: uniform('u_smoothing_radius'), smoothingRange: uniform('u_smoothing_range'),
        eyeBrightening: uniform('u_eye_brightening'), eyeLeft: uniform('u_eye_left'), eyeRight: uniform('u_eye_right') };
      gl.uniform1i(uniforms.image, 0); status('');
      return true;
    } catch { fail(); return false; }
  }
  const contextLost = (event: Event) => {
    if (disposed) return;
    event.preventDefault(); lost = true; clearEyes(); releaseResources(); status(RAW_STATUS);
  };
  const contextRestored = () => {
    if (disposed) return;
    releaseResources(); gl = null; clearEyes(); lost = false; failed = false;
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  return {
    process(source: HTMLVideoElement, settings: CameraBeautySettings): HTMLVideoElement | HTMLCanvasElement {
      const value = normalizeBeautySettings(settings);
      if (disposed) return source;
      if (!value.whitening && !value.smoothing && !value.eyeBrightening) { clearEyes(); status(''); return source; }
      if (!Number.isFinite(source.videoWidth) || !Number.isFinite(source.videoHeight)
        || source.videoWidth <= 0 || source.videoHeight <= 0) { clearEyes(); return source; }
      if (failed || lost || (gl && gl.isContextLost())) {
        if (!failed && !lost) lost = true;
        status(RAW_STATUS);
        return source;
      }
      const eyes = currentEyes(source, value.eyeBrightening > 0);
      if (!value.whitening && !value.smoothing && eyes.length !== 2) { status(EYE_STATUS); return source; }
      const scale = Math.min(1, 960 / source.videoWidth, 540 / source.videoHeight);
      const width = Math.max(1, Math.floor(source.videoWidth * scale));
      const height = Math.max(1, Math.floor(source.videoHeight * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if ((!gl || !program) && !initialize()) return source;
      if (!gl || !program || !uniforms || disposed) return source;
      try {
        gl.viewport(0, 0, width, height); gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform2f(uniforms.texel, 1 / width, 1 / height);
        gl.uniform1f(uniforms.whitening, value.whitening / 100);
        // Widen the neighborhood as the slider rises so 720p texture changes
        // remain visible after the camera is scaled into a floating tile.
        const smoothingResponse = Math.pow(value.smoothing / 100, .65);
        gl.uniform1f(uniforms.smoothing, .96 * smoothingResponse);
        gl.uniform2f(uniforms.smoothingRadius, 1.3 + 1.7 * smoothingResponse, 3 + 6 * smoothingResponse);
        gl.uniform1f(uniforms.smoothingRange, 70 - 52 * smoothingResponse);
        gl.uniform1f(uniforms.eyeBrightening, eyes.length === 2 ? value.eyeBrightening / 100 : 0);
        setEyeUniform(uniforms.eyeLeft, eyes[0]); setEyeUniform(uniforms.eyeRight, eyes[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // WebGL reports upload/draw faults through its error queue as well as
        // exceptions. A failed GPU frame must never replace the raw camera.
        if (gl.getError() !== gl.NO_ERROR) { fail(); return source; }
        status(value.eyeBrightening && eyes.length !== 2 ? EYE_STATUS : '');
        return canvas;
      } catch { fail(); return source; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      releaseResources(); gl = null; clearEyes(); trackedSource = null;
      if (analysisCanvas) { analysisCanvas.width = 0; analysisCanvas.height = 0; }
      analysisContext = null; analysisCanvas = null;
      canvas.width = 0; canvas.height = 0;
    },
  };
}
