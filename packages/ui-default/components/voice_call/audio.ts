export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_FRAME_SAMPLES = 640;

// The processor runs away from page rendering, so a busy editor does not turn
// audio into hundreds of delayed main-thread callbacks. No audio is recorded.
export const VOICE_WORKLET_SOURCE = String.raw`
class OneByOneVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false; this.frame = new Uint8Array(640); this.frameIndex = 0;
    this.weight = 0; this.sum = 0; this.level = 0;
    this.queue = []; this.offset = 0; this.phase = 0; this.playing = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'capture') {
        if (this.enabled === !!data.enabled) return;
        this.enabled = !!data.enabled;
        this.frameIndex = 0; this.weight = 0; this.sum = 0; this.level = 0;
      } else if (data.type === 'play' && data.bytes?.length === 640) {
        const pcm = new Float32Array(640);
        for (let i = 0; i < pcm.length; i++) pcm[i] = this.decode(data.bytes[i]);
        this.queue.push(pcm);
        if (this.queue.length > 6) { this.queue = this.queue.slice(-3); this.offset = 0; this.phase = 0; }
      } else if (data.type === 'clear') {
        this.queue.length = 0; this.offset = 0; this.phase = 0; this.playing = false;
      }
    };
  }
  encode(value) {
    let pcm = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
    const sign = pcm < 0 ? 128 : 0;
    pcm = Math.min(32635, Math.abs(pcm)) + 132;
    let exponent = 7;
    for (let mask = 16384; exponent > 0 && !(pcm & mask); mask >>= 1) exponent--;
    return ~(sign | (exponent << 4) | ((pcm >> (exponent + 3)) & 15)) & 255;
  }
  decode(value) {
    const n = (~value) & 255;
    const pcm = (((n & 15) << 3) + 132) * (1 << ((n & 112) >> 4)) - 132;
    return (n & 128 ? -pcm : pcm) / 32768;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (input && this.enabled) {
      const ratio = sampleRate / 16000;
      for (let i = 0; i < input.length; i++) {
        let remaining = 1;
        while (remaining > 1e-7) {
          const part = Math.min(remaining, ratio - this.weight);
          this.sum += input[i] * part; this.weight += part; remaining -= part;
          if (this.weight >= ratio - 1e-7) {
            const value = this.sum / ratio;
            this.level += value * value;
            this.frame[this.frameIndex++] = this.encode(value);
            this.weight = 0; this.sum = 0;
            if (this.frameIndex === 640) {
              this.port.postMessage({ type: 'frame', bytes: this.frame, level: Math.sqrt(this.level / 640) }, [this.frame.buffer]);
              this.frame = new Uint8Array(640); this.frameIndex = 0; this.level = 0;
            }
          }
        }
      }
    }
    if (output) {
      output.fill(0);
      if (!this.playing && this.queue.length >= 2) this.playing = true;
      const step = 16000 / sampleRate;
      for (let i = 0; i < output.length && this.playing; i++) {
        const frame = this.queue[0];
        if (!frame) { this.playing = false; this.offset = 0; this.phase = 0; break; }
        const next = this.offset + 1 < frame.length ? frame[this.offset + 1] : this.queue[1]?.[0] ?? frame[this.offset];
        output[i] = frame[this.offset] + (next - frame[this.offset]) * this.phase;
        this.phase += step;
        while (this.phase >= 1) {
          this.phase--; this.offset++;
          if (this.offset >= frame.length) { this.queue.shift(); this.offset = 0; }
        }
      }
    }
    return true;
  }
}
registerProcessor('onebyone-voice', OneByOneVoiceProcessor);
`;

export function encodeVoiceFrame(bytes: Uint8Array) {
  if (bytes.length !== VOICE_FRAME_SAMPLES) throw new Error('Invalid voice frame');
  return btoa(String.fromCharCode(...bytes));
}

export function decodeVoiceFrame(data: string) {
  if (typeof data !== 'string' || data.length !== 856 || !/^[A-Za-z0-9+/]{854}==$/.test(data)) return null;
  try {
    const value = atob(data);
    if (value.length !== VOICE_FRAME_SAMPLES) return null;
    return Uint8Array.from(value, (character) => character.charCodeAt(0));
  } catch { return null; }
}

export function microphoneError(error: any) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return '麦克风权限未开启。点击地址栏的权限图标允许麦克风，然后重试。';
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return '没有找到麦克风，请连接麦克风后重试。';
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') return '麦克风暂时无法使用，请检查设备是否被其他应用占用。';
  return error?.message || '语音暂时无法启动，请检查麦克风后重试。';
}

export type VoiceAudioSetupState = 'microphone-pending' | 'microphone-granted' | 'ready' | 'idle';

export class VoicePlaybackBlockedError extends Error {
  constructor(message = '浏览器暂停了语音，请点击下方按钮开启声音。') {
    super(message); this.name = 'VoicePlaybackBlockedError';
  }
}

export class VoiceAudio {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private generation = 0;
  private transmitting = false;
  private muted = false;
  private lastSequence = -1;
  private lastPacketAt = 0;
  private staleTimer = 0;
  private outputSetup: Promise<void> | null = null;
  private keepListening = false;
  private inputPaused = false;
  private inputAttempt = 0;

  constructor(private options: { onFrame(data: string): void; onLevel?(level: number): void; onError?(error: Error): void;
    onSetupState?(state: VoiceAudioSetupState): void; onInputEnded?(): void; onPlaybackPaused?(paused: boolean): void;
    onInputPaused?(paused: boolean): void }) {}
  get ready() { return !!this.processor && !!this.source; }
  get inputEnded() { return this.stream?.getAudioTracks().some(track => track.readyState === 'ended') === true; }
  get needsResume() { return !!this.processor && this.context?.state !== 'running'; }

  private audioContext() {
    if (!this.context) {
      this.stop();
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }
    return this.context;
  }
  private async resume(context: AudioContext, message?: string) {
    let timeout = 0;
    try {
      await Promise.race([context.resume(), new Promise((_, reject) => {
        timeout = window.setTimeout(() => reject(new VoicePlaybackBlockedError(message)), 1800);
      })]);
      if (context.state !== 'running') throw new VoicePlaybackBlockedError(message);
    } catch { throw new VoicePlaybackBlockedError(message); }
    finally { window.clearTimeout(timeout); }
  }
  private async makeOutput(context: AudioContext, generation: number) {
    const url = URL.createObjectURL(new Blob([VOICE_WORKLET_SOURCE], { type: 'text/javascript' }));
    try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    if (generation !== this.generation) return;
    const processor = new AudioWorkletNode(context, 'onebyone-voice', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.processor = processor;
    processor.port.onmessage = ({ data }) => {
      if (generation !== this.generation || data?.type !== 'frame' || !this.transmitting || this.muted) return;
      this.options.onFrame(encodeVoiceFrame(data.bytes));
      this.options.onLevel?.(Math.min(1, Number(data.level) * 5 || 0));
    };
    processor.onprocessorerror = () => {
      if (generation === this.generation) this.options.onError?.(new Error('音频设备发生错误，请重新开启声音。'));
    };
    context.onstatechange = () => {
      if (context !== this.context || generation !== this.generation) return;
      if (context.state === 'closed') {
        this.options.onError?.(new Error('声音设备已中断，请重新开启声音。'));
        return;
      }
      this.clearPlayback();
      this.options.onPlaybackPaused?.(context.state !== 'running');
    };
    processor.connect(context.destination);
    this.updateCapture();
    this.staleTimer = window.setInterval(() => {
      if (this.lastPacketAt && Date.now() - this.lastPacketAt > 400) this.clearPlayback();
    }, 200);
  }
  private async output(context: AudioContext, generation: number) {
    if (this.processor) return;
    const setup = this.outputSetup ||= this.makeOutput(context, generation);
    try { await setup; } finally { if (this.outputSetup === setup) this.outputSetup = null; }
  }
  // An accepted classroom or ongoing call can receive through its speaker
  // without using a local microphone. Reuse this graph if input becomes available.
  async listen() {
    const context = this.audioContext(); const generation = this.generation;
    this.keepListening = true;
    if (context.state !== 'running') await this.resume(context);
    if (generation === this.generation) await this.output(context, generation);
  }
  async start() {
    if (this.ready) {
      const generation = this.generation;
      try {
        await this.resume(this.context!, '浏览器暂停了语音，请点击“重试设备”恢复语音。');
        if (generation === this.generation) this.options.onSetupState?.('ready');
      } catch (error) { if (generation === this.generation) throw error; }
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('语音需要安全连接，请通过 HTTPS 网站或本机 localhost 打开。');
    }
    if (!window.AudioContext || !window.AudioWorkletNode) throw new Error('当前浏览器不支持实时语音，请使用新版 Chrome、Edge 或 Safari。');
    const context = this.audioContext(); const generation = this.generation;
    if (this.stream) this.releaseInput();
    const inputAttempt = ++this.inputAttempt;
    const ownsInput = () => generation === this.generation && inputAttempt === this.inputAttempt;
    // Preserve user activation for both browser calls. Only start the timeout
    // for playback after the learner has answered the native microphone prompt.
    let resume: Promise<void>;
    try { resume = context.resume().catch(() => { throw new VoicePlaybackBlockedError(); }); }
    catch { resume = Promise.reject(new VoicePlaybackBlockedError()); }
    void resume.catch(() => {});
    try {
      this.options.onSetupState?.('microphone-pending');
      if (!ownsInput()) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      }, video: false });
      if (!ownsInput()) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const tracks = stream.getAudioTracks();
      if (!tracks.length || tracks.every(track => track.readyState === 'ended')) throw new Error('麦克风没有输入，请连接设备后重试。');
      for (const track of tracks) track.enabled = !this.muted;
      this.options.onSetupState?.('microphone-granted');
      if (!ownsInput()) return;
      let timeout = 0;
      try {
        await Promise.race([resume, new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new VoicePlaybackBlockedError()), 1800); })]);
      } finally { window.clearTimeout(timeout); }
      if (!ownsInput()) return;
      if (context.state !== 'running') throw new VoicePlaybackBlockedError();
      await this.output(context, generation);
      if (!ownsInput()) return;
      if (tracks.every(track => track.readyState === 'ended')) throw new Error('麦克风已断开，请重新连接后重试。');
      for (const track of tracks) {
        const check = () => { if (this.stream === stream) this.checkInput(); };
        track.addEventListener('mute', check); track.addEventListener('unmute', check);
        track.addEventListener('ended', () => {
          if (!ownsInput() || this.stream !== stream) return;
          this.releaseInput();
          if (this.options.onInputEnded) this.options.onInputEnded();
          else this.options.onError?.(new Error('麦克风已断开，请重新连接后拨号。'));
        });
      }
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(this.processor!); this.updateCapture(); this.checkInput();
      this.options.onSetupState?.('ready');
    } catch (error) {
      if (!ownsInput()) return;
      if (this.keepListening) this.releaseInput(); else this.stop();
      throw error;
    }
  }
  releaseInput() {
    this.inputAttempt++;
    this.transmitting = false;
    this.source?.disconnect(); this.source = null;
    const previous = this.stream; this.stream = null;
    previous?.getTracks().forEach(track => track.stop());
    this.updateCapture(); this.checkInput(); this.options.onLevel?.(0);
  }
  private checkInput() {
    const tracks = this.stream?.getAudioTracks();
    const paused = !this.muted && !!tracks?.length && tracks.every(track => track.muted);
    if (this.inputPaused !== paused) { this.inputPaused = paused; this.options.onInputPaused?.(paused); }
  }

  setTransmitting(enabled: boolean) { this.transmitting = enabled; this.updateCapture(); }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    this.updateCapture(); this.checkInput(); this.options.onLevel?.(0);
  }
  private updateCapture() { this.processor?.port.postMessage({ type: 'capture', enabled: this.transmitting && !this.muted }); }
  clearPlayback() {
    this.processor?.port.postMessage({ type: 'clear' }); this.lastPacketAt = 0;
  }
  receive(sequence: number, data: string) {
    if (!this.processor || !Number.isSafeInteger(sequence) || sequence < 0 || sequence <= this.lastSequence) return false;
    const bytes = decodeVoiceFrame(data);
    if (!bytes) return false;
    this.lastSequence = sequence;
    if (this.context?.state && this.context.state !== 'running') return false;
    this.lastPacketAt = Date.now();
    this.processor.port.postMessage({ type: 'play', bytes }, [bytes.buffer]);
    return true;
  }
  resetReceive() { this.lastSequence = -1; this.clearPlayback(); }
  stop() {
    this.generation++; this.transmitting = false; this.lastSequence = -1; this.lastPacketAt = 0;
    window.clearInterval(this.staleTimer);
    this.outputSetup = null; this.keepListening = false;
    if (this.context) this.context.onstatechange = null;
    if (this.processor) { this.processor.port.onmessage = null; this.processor.port.close(); this.processor.disconnect(); }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => {});
    this.processor = null; this.source = null; this.stream = null; this.context = null;
    this.checkInput();
    this.options.onLevel?.(0);
    this.options.onSetupState?.('idle');
  }
}
