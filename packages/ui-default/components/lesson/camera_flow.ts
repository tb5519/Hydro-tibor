// The receiver dates its own short-lived requests. A delayed TCP frame cannot
// look fresh just because it arrived now, even when the two clocks disagree.
export const CAMERA_WINDOW_MS = 250;
const FRESH_MS = 900;
const SPEECH_FRESH_MS = 2500;
const cameraProfiles = [
  { width: 320, height: 180, fps: 5, bytes: 3500 },
  { width: 480, height: 270, fps: 10, bytes: 8000 },
  { width: 640, height: 360, fps: 16, bytes: 14000 },
  { width: 960, height: 540, fps: 25, bytes: 24000 },
];
export class LessonCameraFlow {
  private issued = new Map<number, { at: number; wall: number }>();
  private serial = 0;
  private remoteTicket = -1;
  private remoteAt = -Infinity;
  private remoteWall = -Infinity;
  private remoteLevel = 1;
  private lastPicture = -Infinity;
  private sentAt = -Infinity;
  private adjustedAt = 0;
  private bestAge = Infinity;
  private received = 0;
  private level = 1;
  private tagged = false;
  private taggedAudio = false;
  private negotiatingAt = 0;
  private highestSeen = -1;
  private unconfirmed: { seq: number; bytes: number }[] = [];
  private lastProbe = -Infinity;
  constructor(private now = () => performance.now(), private profiles = cameraProfiles) {}
  reset() {
    this.negotiatingAt = this.now(); this.highestSeen = -1; this.unconfirmed = []; this.lastProbe = -Infinity;
    this.issued.clear(); this.remoteTicket = -1; this.remoteAt = -Infinity; this.remoteWall = -Infinity;
    this.lastPicture = -Infinity; this.sentAt = -Infinity; this.remoteLevel = 1;
    this.adjustedAt = this.now(); this.bestAge = Infinity; this.received = 0; this.level = 1; this.tagged = false; this.taggedAudio = false;
  }
  request(send: (seq: number, level: number, seen?: number) => boolean) {
    const now = this.now();
    if (now - this.sentAt < (this.level >= 2 ? 160 : CAMERA_WINDOW_MS)) return;
    for (const [id, request] of this.issued) if (now - request.at > SPEECH_FRESH_MS || Date.now() - request.wall > SPEECH_FRESH_MS) this.issued.delete(id);
    const elapsed = now - this.adjustedAt;
    if (elapsed >= 1200) {
      const fps = this.received * 1000 / elapsed;
      const slow = this.bestAge > 360 || fps < this.profiles[this.level].fps * .55;
      if (slow || elapsed >= 3500) {
        if (slow) this.level = Math.max(0, this.level - 1);
        else if (this.bestAge < 240) this.level = Math.min(this.profiles.length - 1, this.level + 1);
        this.received = 0; this.bestAge = Infinity; this.adjustedAt = now;
      }
    }
    this.sentAt = now;
    const seq = ++this.serial;
    if (send(seq, this.level, this.highestSeen < 0 ? undefined : this.highestSeen)) this.issued.set(seq, { at: now, wall: Date.now() });
  }
  acceptWindow(seq: number, level: number, seen?: number) {
    if (!Number.isSafeInteger(seq) || seq <= 0 || seq <= this.remoteTicket || !Number.isInteger(level) || !this.profiles[level]) return;
    if (typeof seen === 'number' && Number.isSafeInteger(seen)) this.unconfirmed = this.unconfirmed.filter(frame => frame.seq > seen);
    this.remoteTicket = seq; this.remoteLevel = level; this.remoteAt = this.now(); this.remoteWall = Date.now();
  }
  nextPicture() {
    const now = this.now();
    // Allow time for a current peer's first window before the legacy fallback.
    if (this.remoteTicket < 0) return now - this.negotiatingAt < 1200 ? null : undefined;
    const busy = this.unconfirmed.length >= 4 || this.unconfirmed.reduce((sum, frame) => sum + frame.bytes, 0) >= 48000;
    if (busy && now - this.lastProbe < 900) return null;
    const profile = this.profiles[busy ? 0 : this.remoteLevel];
    if (now - this.remoteAt > FRESH_MS || Date.now() - this.remoteWall > FRESH_MS || now - this.lastPicture < 1000 / profile.fps - 1) return null;
    if (busy) this.lastProbe = now;
    this.lastPicture = now; return { ticket: this.remoteTicket, profile };
  }
  sent(seq: number, bytes: number) {
    // A lost packet does not hold the window open forever. A later small probe
    // acknowledges the whole prefix when it arrives across the reliable transport.
    if (this.unconfirmed.length >= 6) this.unconfirmed.shift();
    this.unconfirmed.push({ seq, bytes });
  }
  arrived(seq: number, ticket?: number) {
    if (ticket !== undefined) this.highestSeen = Math.max(this.highestSeen, seq);
  }
  speechTicket() {
    if (this.remoteTicket < 0) return undefined;
    return this.now() - this.remoteAt <= SPEECH_FRESH_MS && Date.now() - this.remoteWall <= SPEECH_FRESH_MS ? this.remoteTicket : null;
  }
  acceptSpeech(ticket?: number) {
    if (ticket === undefined) return !this.taggedAudio;
    const request = this.issued.get(ticket);
    if (!request || this.now() - request.at > SPEECH_FRESH_MS || Date.now() - request.wall > SPEECH_FRESH_MS) return false;
    this.taggedAudio = true; return true;
  }
  fresh(ticket?: number) {
    if (ticket === undefined) return !this.tagged;
    const request = this.issued.get(ticket);
    return !!request && this.now() - request.at <= FRESH_MS && Date.now() - request.wall <= FRESH_MS;
  }
  displayed(ticket?: number) {
    if (ticket === undefined) return;
    const request = this.issued.get(ticket);
    if (!request) return;
    this.tagged = true; this.received++;
    this.bestAge = Math.min(this.bestAge, this.now() - request.at);
  }
}
