# Interactive IDE WebSocket contract

Authenticated endpoint: route `ide_conn`, `/d/<domainId>/ide/conn` (system-domain
routing may omit the `/d/system` prefix). Use the server-generated URL.
The connection immediately sends `ready`; no extra hello is needed.

Client → server:

- `run {runId, lang, code}`: runId matches `[A-Za-z0-9_-]{16,80}`, fresh per run.
  Replaying a runId on one connection never executes it twice.
- `input {runId, seq, text}`: actual stdin bytes represented as UTF-8 text. The UI
  supplies the newline when the user presses Enter. No automatic newline is added.
- `turtle-event {runId, seq, event}`: graphical input from PROTOCOL.md.
- `stop {runId}`: stop this connection's matching run.

Use one increasing client `seq` for **both input and turtle-event** within each
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
budget. Default two active users globally, one run per user across all tabs and
Hydro workers, one compiler globally. No queue consumes Judge capacity.
User+slot leases are Mongo-atomic and expire after 1890 seconds; on unconfirmed
sandbox disconnection they are intentionally retained until that hard deadline.
Normal confirmed completion/cancellation immediately releases them.

Per run: 128 KiB source, 16 KiB per stdin/event message, 1 MiB total incoming
bytes, 2 MiB stdout+stderr, 8 MiB graphical protocol / 30,000 commands. Execution
uses 128 MiB, 16 processes, 30 CPU seconds and 30 minutes wall time (for input
and turtle event loops). Compile uses 256 MiB, 20 CPU seconds, 45 wall seconds.
Default sidecar total is 512 MiB / 0.6 CPU; the single compiler lock prevents two
256 MiB compilers from consuming that whole pool simultaneously.

Internal settings: `ide.sandboxHost` defaults `http://ide-sandbox:5050`;
`ide.concurrency` defaults 2 (integer 1–16). Raising concurrency requires raising
the separately configured sidecar capacity. These are administrator settings,
never client-supplied URLs or commands.

Go-judge 1.9.4 only implements streams for TTYs, and 1.12 still needs compatible
termination handling. `transport.py` multiplexes real child pipes through one
raw TTY; no shell is launched. Only fd 0 and 1 are streamed externally to avoid
two readers competing for the same TTY output. A `{ready:true}` frame ensures
raw mode is configured before stdin is accepted. Internal envelopes are
`{fd:1|2|3,data:base64}` outbound and `{fd:0|4,data:base64}` inbound. Native runs
use stdbuf and a read-only `/proc` syscall check to detect actual stdin waits;
the adapter's Python input hook provides the same notifications for Python.
