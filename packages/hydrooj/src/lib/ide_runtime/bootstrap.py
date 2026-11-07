"""Entry point for an isolated OneByOne Python run.

Descriptors 0/1/2 retain their usual stdin/stdout/stderr meaning. Descriptor 3
contains JSONL UI events; descriptor 4 contains validated graphical input.
This module is a protocol adapter, not a security boundary. The runner must
isolate the process and enforce CPU, memory, process and output limits.
"""

import builtins
from collections import deque
import io
import json
import os
import runpy
import select
import sys
import time
import types


class Bridge:
    def __init__(self):
        self.output_fd = int(os.environ.get("ONEBYONE_IDE_GRAPHICS_FD", "3"))
        self.input_fd = int(os.environ.get("ONEBYONE_IDE_EVENTS_FD", "4"))
        self.pending = bytearray()
        self.events = deque()
        self.closed = False
        self.handler = None
        self.tick = None
        self.dispatching = False
        self.request_id = 0
        self.responses = {}
        self.input_depth = 0
        self.interaction_wait = None
        self.execution_waiting = False
        self.input_execution_states = []
        try:
            os.set_blocking(self.input_fd, False)
        except OSError:
            self.closed = True

    def emit(self, message):
        data = (json.dumps(message, ensure_ascii=False, allow_nan=False,
                           separators=(",", ":")) + "\n").encode("utf-8")
        if len(data) > 65536:
            raise RuntimeError("绘图数据过大，请减少单次绘制的内容。")
        try:
            while data:
                count = os.write(self.output_fd, data)
                data = data[count:]
        except (OSError, BrokenPipeError) as error:
            raise SystemExit("运行连接已关闭。") from error

    def begin_input(self, prompt=""):
        self.input_execution_states.append(self.execution_wait(True))
        if not self.input_depth:
            self.emit({"type": "input", "prompt": str(prompt)[:4096]})
        self.input_depth += 1

    def end_input(self):
        self.input_depth = max(0, self.input_depth - 1)
        if not self.input_depth:
            self.emit({"type": "input-end"})
        self.execution_wait(self.input_execution_states.pop() if self.input_execution_states else False)

    def execution_wait(self, waiting):
        previous = self.execution_waiting
        if waiting != previous:
            self.execution_waiting = waiting
            self.emit({"type": "execution-wait", "waiting": waiting})
        return previous

    def wait_for_interaction(self, kind, temporary=False):
        previous = self.interaction_wait
        if previous != kind:
            self.interaction_wait = kind
            self.emit({"type": "interaction-wait", "kind": kind} if kind else
                      {"type": "interaction-end", "temporary": temporary})
        self.execution_wait(kind is not None)
        return previous

    def callback(self, function, *args):
        # Only actual event waits pause the execution budget. A user callback
        # (including an ontimer callback) is executable code again.
        previous_execution = self.execution_waiting
        previous = self.wait_for_interaction(None, temporary=True)
        try:
            return function(*args)
        finally:
            self.wait_for_interaction(previous)
            self.execution_wait(previous_execution)

    def pump(self, timeout=0):
        if self.tick and not self.dispatching:
            self.tick()
        self._dispatch()
        if self.closed:
            if timeout:
                time.sleep(min(timeout, 0.02))
            return
        try:
            ready, _, _ = select.select([self.input_fd], [], [], max(0, min(timeout, 0.05)))
            if not ready:
                return
            chunk = os.read(self.input_fd, 65536)
        except (OSError, ValueError):
            self.closed = True
            return
        if not chunk:
            self.closed = True
            return
        self.pending.extend(chunk)
        if len(self.pending) > 131072:
            self.pending.clear()
            return
        while b"\n" in self.pending:
            raw, _, rest = self.pending.partition(b"\n")
            self.pending = bytearray(rest)
            if len(raw) > 16384:
                continue
            try:
                event = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") == "response":
                identity = event.get("id")
                if isinstance(identity, int) and 0 < identity <= self.request_id:
                    self.responses[identity] = event.get("value")
                continue
            if len(self.events) < 512:
                self.events.append(event)
        self._dispatch()

    def _dispatch(self):
        # Drawing inside a callback can pump again. Queue events until that
        # callback returns, rather than dropping input or recursing into it.
        if self.dispatching or not self.handler:
            return
        count = 0
        while self.events and count < 64:
            event = self.events.popleft()
            count += 1
            self.dispatching = True
            try:
                self.callback(self.handler, event)
            finally:
                self.dispatching = False

    def sleep(self, seconds):
        until = time.monotonic() + max(0, seconds)
        while time.monotonic() < until:
            self.pump(min(0.02, until - time.monotonic()))

    def request(self, kind, title, prompt, **kwargs):
        self.request_id += 1
        identity = self.request_id
        self.emit({"type": "draw", "command": {"op": "request", "id": identity,
                   "kind": kind, "title": str(title)[:256], "prompt": str(prompt)[:4096], **kwargs}})
        previous_execution = self.execution_waiting
        previous = self.wait_for_interaction("input")
        try:
            while identity not in self.responses:
                if self.closed:
                    return None
                self.pump(0.02)
            return self.responses.pop(identity)
        finally:
            self.wait_for_interaction(previous)
            self.execution_wait(previous_execution)


bridge = Bridge()
module = types.ModuleType("_onebyone_ide")
module.bridge = bridge
sys.modules["_onebyone_ide"] = module


class InteractiveStdin(io.TextIOBase):
    """A line-oriented terminal that also services turtle events while waiting."""

    def __init__(self, original):
        self.original = original
        self.bytes = bytearray()
        self.eof = False

    @property
    def encoding(self):
        return "utf-8"

    @property
    def errors(self):
        return "replace"

    @property
    def buffer(self):
        # Binary programs retain actual descriptor semantics. Only text input
        # adds waiting-state notifications and the graphical event pump.
        return self.original.buffer

    def fileno(self):
        return self.original.fileno()

    def isatty(self):
        return True

    def readable(self):
        return True

    def _read(self):
        while not self.eof:
            bridge.pump(0)
            ready, _, _ = select.select([self.fileno()], [], [], 0.02)
            if ready:
                chunk = os.read(self.fileno(), 4096)
                if not chunk:
                    self.eof = True
                self.bytes.extend(chunk)
                return

    def readline(self, size=-1):
        if size == 0:
            return ""
        bridge.begin_input()
        try:
            while b"\n" not in self.bytes and not self.eof:
                self._read()
            length = self.bytes.find(b"\n") + 1
            if length <= 0:
                length = len(self.bytes)
            raw = bytes(self.bytes[:length])
            text = raw.decode("utf-8", "replace")
            if size >= 0 and len(text) > size:
                text = text[:size]
                length = len(text.encode("utf-8"))
            del self.bytes[:length]
            return text
        finally:
            bridge.end_input()

    def read(self, size=-1):
        if size == 0:
            return ""
        if size < 0:
            chunks = []
            while True:
                value = self.readline()
                if not value:
                    return "".join(chunks)
                chunks.append(value)
        result = ""
        while len(result) < size:
            value = self.readline(size - len(result))
            if not value:
                break
            result += value
        return result


def main():
    if len(sys.argv) < 2:
        raise SystemExit("缺少运行文件。")
    filename = os.path.abspath(sys.argv[1])
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(filename))
    sys.stdin = InteractiveStdin(sys.stdin)
    original_input = builtins.input

    def interactive_input(prompt=""):
        bridge.begin_input(prompt)
        try:
            return original_input(prompt)
        finally:
            bridge.end_input()

    builtins.input = interactive_input
    runpy.run_path(filename, run_name="__main__")
    turtle = sys.modules.get("turtle")
    if turtle and hasattr(turtle, "_finish"):
        turtle._finish()


if __name__ == "__main__":
    main()
