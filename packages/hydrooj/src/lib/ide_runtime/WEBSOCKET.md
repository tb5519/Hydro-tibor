# Interactive IDE WebSocket contract

Authenticated endpoint: route `ide_conn`, `/d/<domainId>/ide/conn` (system-domain
routing may omit the `/d/system` prefix). Use the server-generated URL.
The connection immediately sends `ready`; no extra hello is needed.

Client → server:

- `run {runId, lang, code}`: runId matches `[A-Za-z0-9_-]{16,80}`, fresh per run.
  Replaying a runId on one connection never executes it twice.
- `input {runId, seq, text}`: actual stdin bytes represented as UTF-8 text. The UI
  supplies the newline when the user presses Enter. No automatic newline is added.
- `input-draft {runId, seq, text}`: changed text in a terminal/dialog input, sent
  only on actual editing (at most once a second is sufficient). Does not write
  stdin. It renews the five-minute idle deadline only during an actual input wait
  and only when the draft text changed; repeated keepalive drafts do not renew it.
- `turtle-event {runId, seq, event}`: graphical input from PROTOCOL.md.
- `stop {runId}`: stop this connection's matching run.

Use one increasing client `seq` for **input, input-draft and turtle-event** within each
run. Duplicate or older sequences are ignored. Unknown runIds cannot control a
run. Input is accepted after the server's `running` event, including while
`waiting-input`. C/C++ waiting on stdin emits input-request even without a prompt.

Server → client:

- `ready {languages, limits}`: languages already intersect classroom settings,
  disabled/remote language flags, and the teacher's student language policy.
- `state {runId, seq, state}`: starting / compiling / running / waiting-input.
- `output {runId, seq, stream, text}`: stream is stdout or stderr; text is plain
  untrusted text, never HTML. Chunk boundaries are arbitrary.
- `input-request {runId, seq, prompt}` and `input-end {runId, seq}`.
- `turtle {runId, seq, commands}`: ordered validated graphical commands.
- `exit {runId, seq, status, exitCode, reason}`: status finished / failed /
  stopped / compile-error. `reason` is user-facing text.
- `error {runId?, code, message, fatal}`: validation/start failure; a nonfatal
  error leaves the current execution and Stop control intact.

Every run event (excluding error) has a strictly increasing server sequence.
Closing the page/connection stops the process. Reconnection never replays the
program; tell the user it stopped and let them explicitly Run again. Teacher
commands operate on the learner's existing runtime connection through the
existing authorized sharing relay. Never create a second teacher execution.

## Limits and isolation

Dedicated `ide-sandbox` service, independent of Judge's worker queue and CPU
budget. Default four active users globally, one run per user across all tabs and
Hydro workers, one compiler globally. No queue consumes Judge capacity.
User+slot leases are Mongo-atomic and expire after 1890 seconds; on unconfirmed
sandbox disconnection they are intentionally retained until that hard deadline.
Normal confirmed completion/cancellation immediately releases them.

Per run: 128 KiB source, 16 KiB per stdin/event message, 1 MiB total incoming
bytes, 2 MiB stdout+stderr, 8 MiB graphical protocol / 30,000 commands. Execution
uses 128 MiB, 16 processes, 30 CPU seconds and 30 minutes absolute wall time.
A server watchdog stops after 120 seconds of cumulative active execution,
excluding explicit stdin and turtle interaction waits. Event/timer callbacks
consume that budget; drawing/output/heartbeats never replenish it. Plain sleeping
loops also consume the budget. Forgotten terminal or turtle text/number input
dialogs stop after 300 seconds without real input or changed drafts. Mouse/key
events unrelated to the input do not renew that deadline. Ordinary turtle
mainloop waits remain usable up to the absolute 30-minute limit. All stops
cancel the isolated process and release its slot after termination confirmation.

Compile uses 256 MiB, 20 CPU seconds, 45 wall seconds. Default sidecar total is
768 MiB / 0.6 CPU; the single compiler lock limits the four-slot worst-case
command memory to one 256 MiB compiler plus three 128 MiB runs (640 MiB), leaving
128 MiB for service overhead. This is a cap, not reserved RAM or a zero-impact
guarantee for Hydro's own relay work. Provisioning upgrades the verified old
512 MiB profile in place without restarting it or changing the CPU cap.

Internal settings: `ide.sandboxHost` defaults `http://ide-sandbox:5050`;
`ide.concurrency` defaults 4 (integer 1–16). Raising concurrency requires raising
the separately configured sidecar capacity. These are administrator settings,
never client-supplied URLs or commands.
The sandbox's `-parallelism 2` is retained for compatibility; go-judge's stream
execution bypasses that worker queue. Mongo leases enforce the four-user cap.

Go-judge 1.9.4 only implements streams for TTYs, and 1.12 still needs compatible
termination handling. `transport.py` multiplexes real child pipes through one
raw TTY; no shell is launched. Only fd 0 and 1 are streamed externally to avoid
two readers competing for the same TTY output. A `{ready:true}` frame ensures
raw mode is configured before stdin is accepted. Internal envelopes are
`{fd:1|2|3,data:base64}` outbound and `{fd:0|4,data:base64}` inbound. Native runs
use stdbuf and a read-only `/proc` syscall check to detect actual stdin waits;
the adapter's Python input hook provides the same notifications for Python.

## Capacity status and administrator stop-all

Use server-generated URLs `ide_capacity` (`GET /ide/capacity`) and
`ide_release` (`POST /ide/release`), with the current domain prefix as usual.
Both return a plain JSON object:

```json
{"capacity":4,"used":2,"available":2,"compilerBusy":false,"ownRunning":false,"canRelease":false,"resetting":false}
```

`available` is the number of free slots, and is zero while `resetting` is true.
`used` counts distinct nonexpired slot leases; user/compiler claims are not
counted again. It can temporarily exceed `capacity` if an administrator lowers
the configured limit while old programs are running. The response discloses no
other learner identities or source. It is private and never cached. Poll every
10 seconds while visible; poll every second while waiting for a reset to finish.
A compiler lock can briefly require waiting even when a run slot is free.

Both endpoints freshly check the login, no-sudo requirement, classroom access
and available authorized languages. GET accepts same-origin browser fetch
metadata or validates Origin/Referer. POST requires a matching Origin and rejects
cross-site fetch metadata. The global stop-all action additionally requires
fresh `teacherScope`, a session authorized to edit the domain, and either a
platform administrator or a legacy-workspace owner/system administrator.
Ordinary teachers in other workspaces can view capacity but cannot stop the
shared global pool. Never trust a client-side `canRelease` value for authority.

POST increments a persistent Mongo control revision and closes new admission.
Repeated requests join an in-progress reset. Active connections check the
control revision every second and cancel their own isolated IDE processes,
including an in-progress compiler. A slot is released only after the isolated
process confirms termination. Once every unexpired claim is gone, a revision-
checked update reopens admission. A run acquiring concurrently must reread the
control gate after its leases are persisted and before starting. This rejects
old delayed admissions even when an empty reset has already completed.
The control revision never expires or resets to zero.

The operation changes only IDE processes/leases/control. Judge queues, user
code drafts, graphics sharing and other platform services are unaffected.
If a worker or execution transport is lost and termination cannot be confirmed,
its lease remains reserved until the existing hard deadline; the response stays
`resetting:true` rather than falsely reporting free capacity. Capacity reads or
confirmed completion can finalize a reset, so completion does not depend on one
particular HTTP request remaining connected.
