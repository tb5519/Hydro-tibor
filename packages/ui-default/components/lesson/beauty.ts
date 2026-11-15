export interface CameraBeautySettings { whitening: number; smoothing: number }

export const DEFAULT_TEACHER_BEAUTY: CameraBeautySettings = { whitening: 20, smoothing: 25 };

export function normalizeBeautySettings(value: unknown): CameraBeautySettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const amount = (key: string, fallback: number) => typeof input[key] === 'number' && Number.isFinite(input[key])
    ? Math.max(0, Math.min(100, Math.round(input[key] as number))) : fallback;
  return { whitening: amount('whitening', 20), smoothing: amount('smoothing', 25) };
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
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const RAW_STATUS = '摄像头美颜暂不可用，当前使用原画。';

/** The caller displays and encodes this same GPU canvas; no CPU pixel pass is needed. */
export function createTeacherCameraBeauty(canvas: HTMLCanvasElement, onStatus?: (message: string) => void) {
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let buffer: WebGLBuffer | null = null;
  let shaders: WebGLShader[] = [];
  let uniforms: { image: WebGLUniformLocation; texel: WebGLUniformLocation;
    whitening: WebGLUniformLocation; smoothing: WebGLUniformLocation;
    smoothingRadius: WebGLUniformLocation; smoothingRange: WebGLUniformLocation } | null = null;
  let disposed = false;
  let failed = false;
  let lost = false;
  let lastStatus = '';

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
        smoothingRadius: uniform('u_smoothing_radius'), smoothingRange: uniform('u_smoothing_range') };
      gl.uniform1i(uniforms.image, 0); status('');
      return true;
    } catch { fail(); return false; }
  }
  const contextLost = (event: Event) => {
    if (disposed) return;
    event.preventDefault(); lost = true; releaseResources(); status(RAW_STATUS);
  };
  const contextRestored = () => {
    if (disposed) return;
    releaseResources(); gl = null; lost = false; failed = false;
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  return {
    process(source: HTMLVideoElement, settings: CameraBeautySettings): HTMLVideoElement | HTMLCanvasElement {
      const value = normalizeBeautySettings(settings);
      if (disposed) return source;
      if (!value.whitening && !value.smoothing) { status(''); return source; }
      if (!Number.isFinite(source.videoWidth) || !Number.isFinite(source.videoHeight)
        || source.videoWidth <= 0 || source.videoHeight <= 0) return source;
      if (failed || lost || (gl && gl.isContextLost())) {
        if (!failed && !lost) lost = true;
        status(RAW_STATUS);
        return source;
      }
      const scale = Math.min(1, 1280 / source.videoWidth, 720 / source.videoHeight);
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
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // WebGL reports upload/draw faults through its error queue as well as
        // exceptions. A failed GPU frame must never replace the raw camera.
        if (gl.getError() !== gl.NO_ERROR) { fail(); return source; }
        return canvas;
      } catch { fail(); return source; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      releaseResources(); gl = null;
      canvas.width = 0; canvas.height = 0;
    },
  };
}
