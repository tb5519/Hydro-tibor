"""Real subprocess tests for terminal/graphics fd separation and teaching APIs.

Run: python3 -B -m unittest discover -s packages/hydrooj/src/lib/ide_runtime -p 'test_*.py'
These tests exercise the adapter only; sandbox isolation belongs to the runner.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import unittest


SOURCE = Path(__file__).parent


class Run:
    def __init__(self, source):
        self.temp = tempfile.TemporaryDirectory()
        directory = Path(self.temp.name)
        shutil.copy(SOURCE / "bootstrap.py", directory / "ide_bootstrap.py")
        shutil.copy(SOURCE / "turtle.py", directory / "turtle.py")
        (directory / "main.py").write_text(textwrap.dedent(source), encoding="utf-8")
        graphics_read, graphics_write = os.pipe()
        events_read, self.events_write = os.pipe()
        environment = {**os.environ, "ONEBYONE_IDE_GRAPHICS_FD": str(graphics_write),
                       "ONEBYONE_IDE_EVENTS_FD": str(events_read), "PYTHONDONTWRITEBYTECODE": "1"}
        self.process = subprocess.Popen([sys.executable, "-B", "-u", str(directory / "ide_bootstrap.py"),
                                         str(directory / "main.py")], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        pass_fds=(graphics_write, events_read), env=environment)
        os.close(graphics_write)
        os.close(events_read)
        self.messages = []
        self.stdout = bytearray()
        self.stderr = bytearray()
        self.read_error = None
        self.reader = os.fdopen(graphics_read, "rb")

        def read_graphics():
            try:
                for line in self.reader:
                    self.messages.append(json.loads(line))
            except Exception as error:
                self.read_error = error

        def read_text(stream, target):
            while True:
                chunk = os.read(stream.fileno(), 4096)
                if not chunk:
                    return
                target.extend(chunk)

        self.threads = [threading.Thread(target=read_graphics),
                        threading.Thread(target=read_text, args=(self.process.stdout, self.stdout)),
                        threading.Thread(target=read_text, args=(self.process.stderr, self.stderr))]
        for thread in self.threads:
            thread.start()

    def wait(self, predicate, seconds=4):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if predicate():
                return
            if self.process.poll() is not None:
                for thread in self.threads:
                    thread.join(1)
                if predicate():
                    return
                break
            time.sleep(0.005)
        raise AssertionError("Runtime wait failed; stdout=%r stderr=%r" % (bytes(self.stdout), bytes(self.stderr)))

    def stdin(self, value):
        self.process.stdin.write(value.encode("utf-8"))
        self.process.stdin.flush()

    def event(self, event):
        os.write(self.events_write, (json.dumps(event) + "\n").encode())

    def commands(self, op=None):
        result = [message["command"] for message in self.messages if message.get("type") == "draw"]
        return [command for command in result if command["op"] == op] if op else result

    def finish(self, status=0):
        self.process.wait(timeout=5)
        for thread in self.threads:
            thread.join(1)
        if self.read_error:
            raise self.read_error
        if self.process.returncode != status:
            raise AssertionError("exit %s, stderr=%s" % (self.process.returncode, self.stderr.decode()))
        return self.stdout.decode("utf-8")

    def close(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=2)
        os.close(self.events_write)
        for thread in self.threads:
            thread.join(1)
        self.reader.close()
        self.process.stdin.close()
        self.process.stdout.close()
        self.process.stderr.close()
        self.temp.cleanup()


class RuntimeTests(unittest.TestCase):
    def run_code(self, source):
        run = Run(source)
        self.addCleanup(run.close)
        return run

    def test_plain_python_and_import_do_not_open_graphics(self):
        run = self.run_code('import turtle\nprint(sum(range(10)))\nprint(\'{"type":"draw"}\')')
        self.assertEqual(run.finish(), '45\n{"type":"draw"}\n')
        self.assertEqual(run.messages, [])

    def test_alternating_print_input_and_unicode(self):
        run = self.run_code('''
            print("你好")
            name = input("名字：")
            print("欢迎", name)
            age = int(input("年龄："))
            print(age + 1)
        ''')
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        run.stdin("小明\n")
        run.wait(lambda: sum(m.get("type") == "input" for m in run.messages) == 2)
        run.stdin("9\n")
        self.assertEqual(run.finish(), "你好\n名字：欢迎 小明\n年龄：10\n")
        self.assertEqual([m["type"] for m in run.messages], ["input", "input-end", "input", "input-end"])
        self.assertEqual([m["prompt"] for m in run.messages if m["type"] == "input"], ["名字：", "年龄："])

    def test_stdin_readline_partial_unicode_and_eof(self):
        run = self.run_code('''
            import sys
            print(repr(sys.stdin.readline(2)))
            print(repr(sys.stdin.readline()))
            print(repr(sys.stdin.read()))
        ''')
        run.stdin("甲乙丙\n最后一行")
        run.process.stdin.close()
        self.assertEqual(run.finish(), "'甲乙'\n'丙\\n'\n'最后一行'\n")

    def test_square_fill_text_and_geometry(self):
        run = self.run_code('''
            import turtle as t
            t.speed(0)
            t.color("blue", "gold")
            t.pensize(3)
            t.begin_fill()
            for _ in range(4):
                t.fd(80)
                t.lt(90)
            t.end_fill()
            assert abs(t.position()) < 1e-8
            assert t.heading() == 0
            assert t.isdown()
            t.write("正方形", font=("Arial", 16, "bold"), align="center")
            t.dot(8, "red")
            t.ht()
            print("ok")
        ''')
        self.assertEqual(run.finish(), "ok\n")
        self.assertEqual(len(run.commands("line")), 4)
        self.assertEqual(run.commands("polygon")[0]["fill"], "gold")
        self.assertEqual(run.commands("text")[0]["text"], "正方形")
        self.assertFalse(run.commands("turtle")[-1]["visible"])

    def test_tracer_zero_has_no_intermediate_updates(self):
        run = self.run_code('''
            import turtle as t
            t.tracer(0)
            for _ in range(3):
                t.forward(100)
                t.left(120)
            input("继续")
            t.update()
            input("结束")
        ''')
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        self.assertEqual(len(run.commands("line")), 3)
        self.assertEqual(run.commands("update"), [])
        run.stdin("\n")
        run.wait(lambda: sum(m.get("type") == "input" for m in run.messages) == 2)
        self.assertEqual(len(run.commands("update")), 1)
        run.stdin("\n")
        run.finish()
        self.assertEqual(len(run.commands("update")), 2)  # final visible frame

    def test_animation_produces_intermediate_frames(self):
        run = self.run_code('''
            import turtle as t
            t.delay(0)
            t.speed(1)
            t.forward(90)
            t.speed(0)
            t.forward(90)
        ''')
        run.finish()
        lines = run.commands("line")
        self.assertGreater(len(lines), 2)
        self.assertLess(lines[0]["x2"], 90)
        self.assertAlmostEqual(lines[-1]["x1"], 90)
        self.assertAlmostEqual(lines[-1]["x2"], 180)

    def test_circles_and_radians(self):
        run = self.run_code('''
            import math
            import turtle as t
            t.speed(0)
            t.circle(50, 180)
            assert abs(t.xcor()) < 1e-8 and abs(t.ycor() - 100) < 1e-8
            assert t.heading() == 180
            t.radians()
            t.seth(math.pi / 2)
            t.forward(20)
            assert abs(t.ycor() - 120) < 1e-8
            t.tilt(math.pi / 2)
            assert abs(t.tiltangle() - math.pi / 2) < 1e-8
            print("ok")
        ''')
        self.assertEqual(run.finish(), "ok\n")

    def test_multi_turtle_clear_reset_and_stamp_undo(self):
        run = self.run_code('''
            import turtle as t
            t.tracer(0)
            a, b = t.Turtle("square"), t.Turtle("circle")
            a.fd(20)
            b.lt(90)
            b.fd(30)
            a.clear()
            assert a.position() == (20, 0)
            stamp = b.stamp()
            b.clearstamp(stamp)
            b.fd(10)
            b.undo()
            assert abs(b.ycor() - 30) < 1e-8
            b.reset()
            assert b.position() == (0, 0)
            assert len(t.turtles()) == 2
            t.clearscreen()
            assert not t.turtles()
            t.fd(5)
        ''')
        run.finish()
        clears = run.commands("clear")
        self.assertIn("turtle", clears[0])
        self.assertNotIn("turtle", clears[-1])
        cursor_ids = set(c["id"] for c in run.commands("turtle"))
        self.assertEqual(len(cursor_ids), 3)
        self.assertGreaterEqual(len(run.commands("remove")), 2)

    def test_custom_shape_clone_and_world_coordinates(self):
        run = self.run_code('''
            import turtle as t
            t.setup(640, 480)
            t.setworldcoordinates(-10, -10, 10, 10)
            t.colormode(255)
            t.register_shape("my triangle", ((0, 10), (-5, -5), (5, -5)))
            a = t.Turtle("my triangle")
            a.color(255, 128, 0)
            a.shapesize(2)
            a.speed(0)
            a.goto(4, 5)
            b = a.clone()
            assert b.position() == a.position()
            assert b.color() == ("#ff8000", "#ff8000")
            assert b.shapesize() == (2, 2, 1)
            assert len(a.get_shapepoly()) == 3
        ''')
        run.finish()
        self.assertEqual(run.commands("screen")[0]["world"], [-10, -10, 10, 10])
        self.assertEqual(run.commands("shape")[0]["name"], "my triangle")
        self.assertEqual(run.commands("turtle")[-1]["fillcolor"], "#ff8000")

    def test_mouse_and_keyboard_callbacks_during_stdin(self):
        run = self.run_code('''
            import turtle as t
            a = t.Turtle()
            a.speed(0)
            a.onclick(lambda x, y: print("turtle", x, y))
            a.ondrag(lambda x, y: a.goto(x, y))
            t.onscreenclick(lambda x, y: print("screen", x, y))
            t.onkey(lambda: print("left released"), "Left")
            t.onkeypress(lambda: print("any pressed"))
            input("ready")
            print("position", a.position())
        ''')
        run.wait(lambda: any(m.get("type") == "input" for m in run.messages))
        identity = run.commands("turtle")[0]["id"]
        run.event({"type": "click", "x": 4, "y": 8, "button": 1, "target": identity})
        run.event({"type": "click", "x": 20, "y": 30, "button": 1, "target": identity, "action": "drag"})
        run.event({"type": "key", "key": "ArrowLeft", "action": "up"})
        run.event({"type": "key", "key": "a", "action": "down"})
        run.wait(lambda: b"any pressed" in run.stdout)
        run.stdin("\n")
        output = run.finish()
        self.assertIn("turtle 4 8\nscreen 4 8", output)
        self.assertIn("left released", output)
        self.assertIn("position (20.00,30.00)", output)

    def test_events_are_not_lost_while_callback_draws(self):
        run = self.run_code('''
            import turtle as t
            a = t.Turtle()
            a.speed(1)
            def move():
                print("moving")
                a.fd(100)
                print("moved")
            t.onkeypress(move, "a")
            t.onkeypress(lambda: print("second"), "b")
            t.listen()
            t.done()
        ''')
        run.wait(lambda: bool(run.commands("update")))
        run.event({"type": "key", "key": "a", "action": "down"})
        run.wait(lambda: b"moving" in run.stdout)
        run.event({"type": "key", "key": "b", "action": "down"})
        run.wait(lambda: b"second" in run.stdout)
        run.event({"type": "close"})
        self.assertEqual(run.finish(), "moving\nmoved\nsecond\n")

    def test_timer_mainloop_and_close(self):
        run = self.run_code('''
            import turtle as t
            t.ontimer(lambda: print("timer"), 15)
            t.done()
            print("closed")
        ''')
        run.wait(lambda: b"timer" in run.stdout)
        run.event({"type": "close"})
        self.assertEqual(run.finish(), "timer\nclosed\n")
        self.assertEqual(len(run.commands("close")), 1)

    def test_text_and_numeric_dialog_validation(self):
        run = self.run_code('''
            import turtle as t
            print(t.textinput("名字", "你叫什么？"))
            print(t.numinput("数量", "1 到 10", default=3, minval=1, maxval=10))
        ''')
        run.wait(lambda: len(run.commands("request")) == 1)
        run.event({"type": "response", "id": run.commands("request")[0]["id"], "value": "小明"})
        run.wait(lambda: len(run.commands("request")) == 2)
        run.event({"type": "response", "id": run.commands("request")[1]["id"], "value": 15})
        run.wait(lambda: len(run.commands("request")) == 3)
        run.event({"type": "response", "id": run.commands("request")[2]["id"], "value": 7})
        self.assertEqual(run.finish(), "小明\n7.0\n")
        self.assertEqual(run.commands("screen"), [])

    def test_invalid_values_and_unsupported_api_are_explicit(self):
        run = self.run_code('''
            import turtle as t
            cases = [lambda: t.pencolor("url(https://example.com/x)"),
                     lambda: t.goto(float("inf"), 0),
                     lambda: t.pensize(-1),
                     lambda: t.register_shape("bad", "x.gif"),
                     lambda: t.getcanvas(), lambda: t.write("x", move=True)]
            for case in cases:
                try:
                    case()
                except (t.TurtleGraphicsError, NotImplementedError):
                    print("rejected")
                else:
                    raise AssertionError("silently accepted unsupported operation")
        ''')
        self.assertEqual(run.finish(), "rejected\n" * 6)
        self.assertEqual(run.commands("text"), [])

    def test_stderr_keeps_python_traceback(self):
        run = self.run_code('print("started")\n1 / 0')
        self.assertEqual(run.finish(status=1), "started\n")
        self.assertIn("ZeroDivisionError", run.stderr.decode())
        self.assertEqual(run.messages, [])


if __name__ == "__main__":
    unittest.main()
