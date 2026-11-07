"""Exercise go-judge's actual raw-PTY transport shape, not a pipe-only mock."""

import base64
import errno
import json
import os
from pathlib import Path
import pty
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
import unittest

from test_runtime import Run, SOURCE


class PtyRun(Run):
    def __init__(self, source, language="python"):
        self.temp = tempfile.TemporaryDirectory()
        directory = Path(self.temp.name)
        for name in ("bootstrap.py", "turtle.py", "transport.py"):
            shutil.copy(SOURCE / name, directory / name)
        if language == "cpp":
            (directory / "main.cpp").write_text(source)
            subprocess.run([shutil.which("c++"), "-std=c++17", str(directory / "main.cpp"),
                            "-o", str(directory / "main")], check=True, capture_output=True)
            command = [str(directory / "main")]
        else:
            (directory / "main.py").write_text(textwrap.dedent(source), encoding="utf-8")
            command = [sys.executable, "-B", "-u", str(directory / "bootstrap.py"), str(directory / "main.py")]
        self.master, slave = pty.openpty()
        self.process = subprocess.Popen([sys.executable, "-B", "-u", str(directory / "transport.py"), *command],
                                        stdin=slave, stdout=slave, stderr=subprocess.PIPE,
                                        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1",
                                             "ONEBYONE_IDE_DETECT_STDIN": "1" if language == "cpp" else "0"}, close_fds=True)
        os.close(slave)
        self.messages = []
        self.stdout, self.stderr, self.wrapper_stderr = bytearray(), bytearray(), bytearray()
        self.read_error = None
        self.ready = False
        self.graphics = bytearray()

        def reader():
            pending = bytearray()
            try:
                while True:
                    try:
                        chunk = os.read(self.master, 4096)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            break
                        raise
                    if not chunk:
                        break
                    pending.extend(chunk)
                    while b"\n" in pending:
                        line, _, rest = pending.partition(b"\n")
                        pending = bytearray(rest)
                        packet = json.loads(line)
                        if packet.get("ready") is True:
                            self.ready = True
                            continue
                        data = base64.b64decode(packet["data"], validate=True)
                        if packet["fd"] == 1:
                            self.stdout.extend(data)
                        elif packet["fd"] == 2:
                            self.stderr.extend(data)
                        elif packet["fd"] == 3:
                            self.graphics.extend(data)
                            while b"\n" in self.graphics:
                                line, _, rest = self.graphics.partition(b"\n")
                                self.graphics = bytearray(rest)
                                self.messages.append(json.loads(line))
                        else:
                            raise AssertionError("unexpected output descriptor")
                if pending:
                    raise AssertionError("partial JSON transport output: %r" % pending)
            except BaseException as error:
                self.read_error = error

        def wrapper_errors():
            self.wrapper_stderr.extend(self.process.stderr.read())

        self.threads = [threading.Thread(target=reader), threading.Thread(target=wrapper_errors)]
        for thread in self.threads:
            thread.start()
        self.wait(lambda: self.ready)

    def send(self, fd, data):
        raw = (json.dumps({"fd": fd, "data": base64.b64encode(data).decode()}) + "\n").encode()
        while raw:
            raw = raw[os.write(self.master, raw):]

    def stdin(self, text):
        self.send(0, text.encode())

    def event(self, event):
        self.send(4, (json.dumps(event) + "\n").encode())

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=2)
        for thread in self.threads:
            thread.join(1)
        os.close(self.master)
        self.process.stderr.close()
        self.temp.cleanup()


class TransportTests(unittest.TestCase):
    def run_code(self, source, language="python"):
        run = PtyRun(source, language)
        self.addCleanup(run.close)
        return run

    def test_python_input_graphics_and_events_across_real_tty(self):
        run = self.run_code('''
            import turtle as t
            t.speed(0)
            t.onkeypress(lambda: t.forward(15), "a")
            name = input("名字：")
            print(name, t.xcor())
        ''')
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        run.event({"type": "key", "key": "a", "action": "down"})
        run.wait(lambda: bool(run.commands("line")))
        run.stdin("小明\n")
        self.assertEqual(run.finish(), "名字：小明 15.0\n")
        self.assertEqual(run.wrapper_stderr, b"")

    def test_control_characters_are_data_and_fds_are_not_merged(self):
        run = self.run_code('''
            import os
            value = input("ready\\n")
            os.write(1, value.encode() + b"\\r\\n")
            os.write(2, b"stderr\\n")
            os.write(3, b'{"type":"draw","command":{"op":"update"}}\\n')
        ''')
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        run.stdin("\x03\x04\x1b甲\n")
        self.assertEqual(run.finish(), "ready\n\x03\x04\x1b甲\r\n")
        self.assertEqual(run.stderr, b"stderr\n")
        self.assertEqual(len(run.commands("update")), 1)

    def test_backpressure_large_stdout_and_exit_status(self):
        run = self.run_code('''
            import sys
            sys.stdout.write("x" * 300000)
            sys.stderr.write("error\\n")
            sys.exit(7)
        ''')
        self.assertEqual(run.finish(status=7), "x" * 300000)
        self.assertEqual(run.stderr, b"error\n")

    @unittest.skipUnless(shutil.which("c++"), "C++ compiler unavailable")
    def test_cpp_cin_without_prompt_and_interactive_prompt(self):
        run = self.run_code('''
            #include <iostream>
            int main() {
                int n; std::cin >> n;
                std::cout << "second: ";
                int m; std::cin >> m;
                std::cout << n + m << std::endl;
            }
        ''', "cpp")
        if sys.platform.startswith("linux"):
            run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        run.stdin("4\n")
        run.wait(lambda: b"second: " in run.stdout)
        run.stdin("5\n")
        self.assertEqual(run.finish(), "second: 9\n")

    @unittest.skipUnless(shutil.which("c++") and sys.platform.startswith("linux"), "Linux syscall observation required")
    def test_cpp_thread_stdin_is_detected_but_empty_program_is_not(self):
        empty = self.run_code('int main() { return 0; }', "cpp")
        self.assertEqual(empty.finish(), "")
        self.assertEqual(empty.messages, [])
        run = self.run_code('''
            #include <iostream>
            #include <thread>
            int main() {
                std::thread t([] { int n; std::cin >> n; std::cout << n * 2 << std::endl; });
                t.join();
            }
        ''', "cpp")
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        run.stdin("7\n")
        self.assertEqual(run.finish(), "14\n")
        self.assertEqual(run.messages[-1]["type"], "input-end")


if __name__ == "__main__":
    unittest.main()
