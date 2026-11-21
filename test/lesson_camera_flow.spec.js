const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const filename = path.resolve(__dirname, '../packages/ui-default/components/lesson/camera_flow.ts');
const compiled = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function classroom() {
    const clock = { monotonic: 0, wall: 1_800_000_000_000 };
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, Date: { now: () => clock.wall } });
    const { LessonCameraFlow } = module.exports;
    const sender = new LessonCameraFlow(() => clock.monotonic); const receiver = new LessonCameraFlow(() => clock.monotonic);
    sender.reset(); receiver.reset();
    let window; let seq = 0;
    const advance = (mono, wall = mono) => { clock.monotonic += mono; clock.wall += wall; };
    const request = (forward = true) => receiver.request((id, level, seen) => {
        window = { id, level, seen };
        if (forward) sender.acceptWindow(id, level, seen);
        return forward;
    });
    const sendFrame = (bytes = 8000) => {
        const picture = sender.nextPicture(); if (!picture) return null;
        const frame = { ticket: picture.ticket, seq: seq++, profile: picture.profile };
        sender.sent(frame.seq, Math.min(bytes, picture.profile.bytes)); return frame;
    };
    const arrive = frame => {
        receiver.arrived(frame.seq, frame.ticket);
        if (!receiver.fresh(frame.ticket)) return false;
        receiver.displayed(frame.ticket); return true;
    };
    return { sender, receiver, clock, advance, request, sendFrame, arrive, window: () => window };
}

it('expires camera requests across tab and system suspension, clock changes, failed sends and connection replacement', () => {
    const f = classroom();
    f.request(); const first = f.window().id;
    const frame = f.sendFrame(); assert.equal(frame.ticket, first);
    f.advance(0, 60_000);
    assert.equal(f.sender.nextPicture(), null);
    assert.equal(f.arrive(frame), false);
    f.advance(250); f.request();
    assert.equal(f.window().seen, 0, 'even an expired frame reports the received prefix, including sequence zero');
    const valid = f.sendFrame(); assert(f.arrive(valid)); assert.equal(f.receiver.fresh(), false);
    f.advance(2000, -60_000);
    assert.equal(f.receiver.fresh(valid.ticket), false, 'a backward clock change does not restore stale pictures');
    assert.equal(f.sender.nextPicture(), null);
    f.request(false); const unsent = f.window().id;
    assert.equal(f.receiver.fresh(unsent), false);
    f.receiver.reset(); f.sender.reset();
    f.request(); assert(f.window().id > unsent); assert.equal(f.window().seen, undefined);
    assert.equal(f.receiver.fresh(first), false);
    assert.equal(f.receiver.fresh(valid.ticket), false);
    assert.equal(f.receiver.fresh(), true, 'a prior negotiated session does not fence out a new legacy peer');
    f.sender.reset();
    assert.equal(f.sender.nextPicture(), null, 'a fresh connection allows a peer to negotiate');
    f.advance(2000);
    assert.equal(f.sender.nextPicture(), undefined, 'an older peer can still receive untagged pictures');
});

it('sustains a 35-minute classroom, lowers camera load during stalls, and restores the picture rate after recovery', () => {
    const f = classroom();
    let inTransit = [];
    function simulate(duration, latency) {
        let peak = 0; let delivered = 0; let expired = 0;
        for (let elapsed = 0; elapsed < duration; elapsed += 20) {
            f.advance(20);
            while (inTransit.length && inTransit[0].at <= f.clock.monotonic) {
                if (f.arrive(inTransit.shift().frame)) delivered++;
                else expired++;
            }
            f.request();
            const frame = f.sendFrame();
            if (frame) { peak = Math.max(peak, frame.profile.width); inTransit.push({ frame, at: f.clock.monotonic + latency }); }
        }
        return { peak, delivered, expired, level: f.window().level };
    }
    const opening = simulate(10 * 60_000, 40);
    assert.equal(opening.peak, 960); assert.equal(opening.level, 3); assert(opening.delivered > 6000);
    const lag = simulate(2 * 60_000, 2000);
    assert(lag.expired > 0); assert.equal(lag.level, 0);
    const slow = simulate(60_000, 2000);
    assert.equal(slow.peak, 320); assert.equal(slow.delivered, 0, 'expired pictures never replace the current display');
    f.advance(20 * 60_000); // Both tabs stop processing network and timers while suspended.
    for (const { frame } of inTransit) assert.equal(f.arrive(frame), false);
    inTransit = [];
    assert.equal(f.sender.nextPicture(), null);
    assert.equal(f.receiver.fresh(), false, 'a negotiated session does not revive untagged frames on wake');
    const recovered = simulate(2 * 60_000, 40);
    assert.equal(recovered.level, 3); assert.equal(recovered.peak, 960); assert(recovered.delivered > 1000);
});

it('bounds unacknowledged large pictures and uses small probes until a newer acknowledgement arrives', () => {
    const f = classroom();
    f.sender.acceptWindow(1, 3);
    assert.equal(f.sendFrame(24000).profile.width, 960);
    f.advance(40); assert.equal(f.sendFrame(24000).profile.width, 960);
    f.advance(200); const probe = f.sendFrame(24000); assert.equal(probe.profile.width, 320);
    f.sender.acceptWindow(2, 3);
    f.advance(100); assert.equal(f.sendFrame(), null);
    f.sender.acceptWindow(1, 3, probe.seq);
    f.advance(100); assert.equal(f.sendFrame(), null, 'an out-of-order window cannot acknowledge newer frames');
    f.sender.acceptWindow(3, 3, probe.seq);
    assert.equal(f.sendFrame().profile.width, 960, 'a current acknowledgement frees the outstanding byte budget');
});

it('drops old speech after a slow downlink or system sleep while allowing slightly delayed conversation', () => {
    const f = classroom(); f.request();
    const ticket = f.sender.speechTicket();
    assert.equal(f.receiver.acceptSpeech(ticket), true);
    assert.equal(f.receiver.acceptSpeech(undefined), false, 'untagged old audio cannot enter this negotiated stream');
    f.advance(1200); assert.equal(f.receiver.fresh(ticket), false);
    assert.equal(f.receiver.acceptSpeech(ticket), true, 'short delays may still carry intelligible speech');
    f.advance(0, 3000);
    assert.equal(f.receiver.acceptSpeech(ticket), false);
    assert.equal(f.sender.speechTicket(), null);
    f.advance(300); f.request();
    assert.equal(f.receiver.acceptSpeech(f.sender.speechTicket()), true);
    f.sender.reset(); f.receiver.reset(); assert.equal(f.receiver.acceptSpeech(ticket), false);
    assert.equal(f.receiver.acceptSpeech(undefined), true, 'an old peer in a new session remains compatible');
});
