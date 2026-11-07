"""Multiplex ordinary child pipes through go-judge's single supported TTY.

The outer TTY is raw (no echo or newline rewriting). Its input/output contain
JSONL envelopes only. Student code still receives ordinary stdin/stdout/stderr
and independent graphics descriptors 3/4. This is not a sandbox: the enclosing
go-judge process cgroup and filesystem enforce isolation and hard limits.
"""

import base64
import binascii
import fcntl
import json
import os
import resource
import select
import signal
import sys
import termios
import time
import tty


MAX_LINE = 32 * 1024
MAX_PENDING = 512 * 1024


def _spawn(argv):
    pairs = [os.pipe() for _ in range(5)]
    # Each mapped source must survive overwriting descriptors 0..4.
    sources = [pairs[0][0], pairs[1][1], pairs[2][1], pairs[3][1], pairs[4][0]]
    duplicated = [fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 16) for fd in sources]
    pid = os.fork()
    if pid == 0:
        try:
            for target, source in enumerate(duplicated):
                os.dup2(source, target)
            limit = resource.getrlimit(resource.RLIMIT_NOFILE)[0]
            os.closerange(5, 65536 if limit == resource.RLIM_INFINITY else min(int(limit), 1048576))
            # Do not inherit Python test overrides or make control descriptors
            # depend on incidental pipe allocation in the transport process.
            environment = {**os.environ, "ONEBYONE_IDE_GRAPHICS_FD": "3", "ONEBYONE_IDE_EVENTS_FD": "4"}
            os.execvpe(argv[0], argv, environment)
        except BaseException as error:
            os.write(2, ("无法启动程序：" + str(error) + "\n").encode("utf-8", "replace"))
            os._exit(127)
    for fd in duplicated:
        os.close(fd)
    keep = {0: pairs[0][1], 1: pairs[1][0], 2: pairs[2][0], 3: pairs[3][0], 4: pairs[4][1]}
    for pair in pairs:
        for fd in pair:
            if fd not in keep.values():
                os.close(fd)
    for fd in keep.values():
        os.set_blocking(fd, False)
    return pid, keep


def _envelope(fd, data):
    return (json.dumps({"fd": fd, "data": base64.b64encode(data).decode("ascii")},
                       separators=(",", ":")) + "\n").encode("ascii")


def _waiting_for_stdin(pid):
    """Observe a real read(0) in any child thread; never guess from its source.

    Linux exposes a parked syscall to the process's same-uid parent. Platforms
    without that interface simply retain the terminal's manual input entry.
    The enclosing sandbox must allow reading this child's /proc metadata.
    """
    calls = {"x86_64": {0, 19}, "amd64": {0, 19}, "aarch64": {63, 65}, "arm64": {63, 65},
             "i386": {3, 145}, "i686": {3, 145}, "armv7l": {3, 145}}.get(os.uname().machine)
    if not calls:
        return False
    try:
        threads = os.listdir("/proc/%d/task" % pid)
    except OSError:
        return False
    for thread in threads[:64]:
        try:
            with open("/proc/%d/task/%s/syscall" % (pid, thread), encoding="ascii") as stream:
                fields = stream.read(512).split()
            if len(fields) >= 2 and int(fields[0], 0) in calls and int(fields[1], 0) == 0:
                return True
        except (OSError, ValueError):
            continue
    return False


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        return 127
    if os.isatty(0):
        tty.setraw(0, termios.TCSANOW)
    os.set_blocking(0, False)
    os.set_blocking(1, False)
    pid, pipes = _spawn(argv)
    readers = {pipes[index]: index for index in (1, 2, 3)}
    writers = {index: pipes[index] for index in (0, 4)}
    pending = {0: bytearray(), 4: bytearray()}
    incoming = bytearray()
    # The backend must wait for this before forwarding input: before setraw,
    # an eager input packet could be echoed by the host TTY into this protocol.
    outgoing = bytearray(b'{"ready":true}\n')
    stdin_open = True
    detect_stdin = os.environ.get("ONEBYONE_IDE_DETECT_STDIN") == "1"
    input_pending = False
    result = None
    exited_at = None
    try:
        while True:
            if result is None:
                child, status = os.waitpid(pid, os.WNOHANG)
                if child:
                    result = os.waitstatus_to_exitcode(status)
                    exited_at = time.monotonic()
                    for fd in writers.values():
                        os.close(fd)
                    writers.clear()
                    pending[0].clear()
                    pending[4].clear()
            if detect_stdin:
                waiting = result is None and _waiting_for_stdin(pid)
                if waiting != input_pending:
                    input_pending = waiting
                    event = {"type": "input", "prompt": ""} if waiting else {"type": "input-end"}
                    outgoing.extend(_envelope(3, (json.dumps(event) + "\n").encode()))
            if result is not None and not readers and not outgoing:
                return result if result >= 0 else min(255, 128 - result)
            # A stray descendant must not hold the wrapper open indefinitely.
            if exited_at is not None and time.monotonic() - exited_at > 2 and not outgoing:
                return result if result >= 0 else min(255, 128 - result)
            read = list(readers) if len(outgoing) < MAX_PENDING else []
            if stdin_open and result is None and sum(len(value) for value in pending.values()) < MAX_PENDING:
                read.append(0)
            write = [writers[key] for key, value in pending.items() if value and key in writers]
            if outgoing:
                write.append(1)
            ready_read, ready_write, _ = select.select(read, write, [], 0.02)
            for fd in ready_read:
                try:
                    data = os.read(fd, 8192)
                except BlockingIOError:
                    continue
                if fd == 0:
                    if not data:
                        stdin_open = False
                        for target in writers.values():
                            os.close(target)
                        writers.clear()
                        continue
                    incoming.extend(data)
                    while b"\n" in incoming:
                        raw, _, rest = incoming.partition(b"\n")
                        incoming = bytearray(rest)
                        if len(raw) > MAX_LINE:
                            raise ValueError("input envelope too large")
                        message = json.loads(raw)
                        target = message.get("fd") if isinstance(message, dict) else None
                        if target not in (0, 4) or not isinstance(message.get("data"), str):
                            raise ValueError("invalid input envelope")
                        chunk = base64.b64decode(message["data"], validate=True)
                        if len(chunk) > 16384 or len(pending[target]) + len(chunk) > MAX_PENDING:
                            raise ValueError("input queue too large")
                        if target in writers:
                            pending[target].extend(chunk)
                    if len(incoming) > MAX_LINE:
                        raise ValueError("input envelope too large")
                elif not data:
                    os.close(fd)
                    readers.pop(fd, None)
                else:
                    outgoing.extend(_envelope(readers[fd], data))
            for fd in ready_write:
                if fd == 1:
                    if outgoing:
                        try:
                            count = os.write(1, outgoing)
                            del outgoing[:count]
                        except BlockingIOError:
                            pass
                    continue
                target = next((key for key, value in writers.items() if value == fd), None)
                if target is None or not pending[target]:
                    continue
                try:
                    count = os.write(fd, pending[target])
                    del pending[target][:count]
                except BlockingIOError:
                    pass
                except BrokenPipeError:
                    os.close(fd)
                    writers.pop(target, None)
                    pending[target].clear()
    except (ValueError, OSError, binascii.Error):
        if result is None:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        failure = _envelope(2, "运行通道出现问题，请重新运行。\n".encode())
        deadline = time.monotonic() + 1
        while failure and time.monotonic() < deadline:
            try:
                _, writable, _ = select.select([], [1], [], 0.05)
                if writable:
                    failure = failure[os.write(1, failure):]
            except OSError:
                break
        return 125
    finally:
        for fd in set(readers) | set(writers.values()):
            try:
                os.close(fd)
            except OSError:
                pass
        if result is None:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass


if __name__ == "__main__":
    sys.exit(main())
