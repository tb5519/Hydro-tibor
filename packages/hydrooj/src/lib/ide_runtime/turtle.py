"""Teaching turtle API rendered by the OneByOne browser canvas.

The interpreter remains CPython; only the drawing surface replaces Tk. See
PROTOCOL.md for the supported wire operations and deliberate compatibility
limits. Importing this module has no graphical side effects.
"""

import heapq
import math
import re
import time
from _onebyone_ide import bridge as _bridge


class TurtleGraphicsError(Exception):
    pass


class Terminator(Exception):
    pass


class Vec2D(tuple):
    def __new__(cls, x, y):
        return tuple.__new__(cls, (x, y))

    def __add__(self, other):
        return Vec2D(self[0] + other[0], self[1] + other[1])

    def __sub__(self, other):
        return Vec2D(self[0] - other[0], self[1] - other[1])

    def __mul__(self, other):
        if isinstance(other, (tuple, list)):
            return self[0] * other[0] + self[1] * other[1]
        return Vec2D(self[0] * other, self[1] * other)

    __rmul__ = __mul__

    def __neg__(self):
        return Vec2D(-self[0], -self[1])

    def __abs__(self):
        return math.hypot(*self)

    def rotate(self, angle):
        angle = math.radians(angle)
        return Vec2D(self[0] * math.cos(angle) - self[1] * math.sin(angle),
                     self[0] * math.sin(angle) + self[1] * math.cos(angle))

    def __repr__(self):
        return "(%.2f,%.2f)" % self


_screen = None
_default_turtle = None
_next_id = 0
_COLORS = set(("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet "
               "brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan "
               "darkblue darkcyan darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen "
               "darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey "
               "darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite "
               "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew "
               "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue "
               "lightcoral lightcyan lightgoldenrodyellow lightgray lightgrey lightgreen lightpink lightsalmon "
               "lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen "
               "linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen "
               "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream "
               "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod "
               "palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple "
               "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna "
               "silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato "
               "turquoise violet wheat white whitesmoke yellow yellowgreen").split())


def _number(value, name="数值", maximum=1000000, minimum=None):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TurtleGraphicsError(name + "必须是有限数字。") from error
    if not math.isfinite(number) or abs(number) > maximum or (minimum is not None and number < minimum):
        raise TurtleGraphicsError(name + "超出支持的范围。")
    return number


def _identity():
    global _next_id
    _next_id += 1
    return _next_id


def _color(value):
    if isinstance(value, str):
        text = value.lower().replace(" ", "")
        if text in _COLORS or re.fullmatch(r"#[0-9a-f]{3}(?:[0-9a-f]{3})?", text):
            return text
        gray = re.fullmatch(r"gr[ae]y(\d{1,3})", text)
        if gray and int(gray[1]) <= 100:
            return "#" + ("%02x" % round(int(gray[1]) * 255 / 100)) * 3
        raise TurtleGraphicsError("不支持的颜色：" + value[:80])
    if isinstance(value, (tuple, list)) and len(value) == 3:
        mode = Screen()._color_mode
        parts = [_number(part, "颜色", mode, 0) for part in value]
        return "#" + "".join("%02x" % round(part * 255 / mode) for part in parts)
    raise TurtleGraphicsError("颜色应为颜色名称、十六进制颜色或 RGB 三元组。")


def _emit(op, **values):
    Screen()._show()
    _bridge.emit({"type": "draw", "command": {"op": op, **values}})


def _unsupported(name):
    raise NotImplementedError("网页海龟暂不支持 " + name + "；请使用海龟绘图接口。")


class _Screen:
    def __init__(self):
        self._width, self._height = 800, 600
        self._world = [-400, -300, 400, 300]
        self._background = "white"
        self._title = "海龟绘图"
        self._color_mode = 1.0
        self._mode = "standard"
        self._tracer = 1
        self._delay = 10
        self._updates = 0
        self._visible = False
        self._closed = False
        self._turtles = []
        self._clicks = {}
        self._keys = {}
        self._timers = []
        self._timer_order = 0
        self._shapes = {name: None for name in ("arrow", "turtle", "circle", "square", "triangle", "classic")}
        _bridge.handler = self._event
        _bridge.tick = self._tick

    def _show(self):
        if self._closed:
            raise Terminator("海龟窗口已关闭。")
        if not self._visible:
            self._visible = True
            self._metadata()

    def _metadata(self):
        if self._visible:
            _bridge.emit({"type": "draw", "command": {"op": "screen", "width": self._width,
                         "height": self._height, "bg": self._background, "title": self._title,
                         "world": self._world}})

    def _step(self, animate=True):
        self._updates += 1
        if self._tracer and self._updates % self._tracer == 0:
            self.update()
            if animate and self._delay:
                _bridge.sleep(self._delay / 1000)
        else:
            _bridge.pump(0)

    def setup(self, width=0.5, height=0.75, startx=None, starty=None):
        width = _number(width, "画布宽度", 1600, 0.01)
        height = _number(height, "画布高度", 1600, 0.01)
        self._width = round(max(64, min(1600, width * 1280 if width <= 1 else width)))
        self._height = round(max(64, min(1600, height * 800 if height <= 1 else height)))
        if self._mode != "world":
            self._world = [-self._width / 2, -self._height / 2, self._width / 2, self._height / 2]
        self._metadata()

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth is None and canvheight is None and bg is None:
            return (self._width, self._height)
        self.setup(canvwidth if canvwidth is not None else self._width,
                   canvheight if canvheight is not None else self._height)
        if bg is not None:
            self.bgcolor(bg)

    def window_width(self):
        return self._width

    def window_height(self):
        return self._height

    def title(self, titlestring):
        self._title = str(titlestring)[:256]
        self._metadata()

    def bgcolor(self, *args):
        if not args:
            return self._background
        self._background = _color(args[0] if len(args) == 1 else args)
        self._show()
        self._metadata()

    def colormode(self, cmode=None):
        if cmode is not None:
            if cmode not in (1.0, 255):
                raise TurtleGraphicsError("colormode 只支持 1.0 或 255。")
            self._color_mode = cmode
        return self._color_mode

    def mode(self, mode=None):
        if mode is None:
            return self._mode
        if mode not in ("standard", "logo", "world"):
            raise TurtleGraphicsError("不支持的海龟坐标模式。")
        self._mode = mode
        self.reset()

    def setworldcoordinates(self, llx, lly, urx, ury):
        values = [_number(value, "世界坐标") for value in (llx, lly, urx, ury)]
        if values[0] >= values[2] or values[1] >= values[3]:
            raise TurtleGraphicsError("世界坐标的右上角必须大于左下角。")
        self._world = values
        self._mode = "world"
        self._metadata()

    def tracer(self, n=None, delay=None):
        if n is None:
            return self._tracer
        self._tracer = int(_number(n, "刷新间隔", 100000, 0))
        if delay is not None:
            self.delay(delay)
        if self._tracer:
            self.update()

    def delay(self, delay=None):
        if delay is None:
            return self._delay
        self._delay = int(_number(delay, "延时", 10000, 0))

    def update(self):
        if self._visible and not self._closed:
            _bridge.emit({"type": "draw", "command": {"op": "update"}})
        _bridge.pump(0)

    def turtles(self):
        return self._turtles[:]

    def clear(self):
        global _default_turtle
        for item in self._turtles:
            item._visible = False
            item._state()
        self._turtles = []
        self._clicks = {}
        self._keys = {}
        self._timers = []
        self._tracer, self._delay = 1, 10
        _default_turtle = None
        _emit("clear")
        self._background = "white"
        self._metadata()
        self.update()

    clearscreen = clear

    def reset(self):
        for item in self._turtles:
            item.reset()

    resetscreen = reset

    def listen(self, xdummy=None, ydummy=None):
        self._show()

    def onclick(self, fun, btn=1, add=None):
        btn = int(_number(btn, "鼠标按键", 3, 1))
        if fun is None:
            self._clicks.pop(btn, None)
        else:
            if not callable(fun):
                raise TypeError("鼠标回调必须是函数。")
            self._clicks[btn] = (self._clicks.get(btn, []) if add else []) + [fun]

    onscreenclick = onclick

    def _key(self, fun, key, action):
        if key is not None and (not isinstance(key, str) or len(key) > 64):
            raise TurtleGraphicsError("按键名称无效。")
        identity = (action, key)
        if fun is None:
            self._keys.pop(identity, None)
        else:
            if not callable(fun):
                raise TypeError("按键回调必须是函数。")
            self._keys[identity] = fun

    def onkey(self, fun, key):
        self._key(fun, key, "up")

    onkeyrelease = onkey

    def onkeypress(self, fun, key=None):
        self._key(fun, key, "down")

    def ontimer(self, fun, t=0):
        if not callable(fun):
            raise TypeError("定时器回调必须是函数。")
        if len(self._timers) >= 1024:
            raise TurtleGraphicsError("定时器过多。")
        self._timer_order += 1
        heapq.heappush(self._timers, (time.monotonic() + _number(t, "定时器延时", 3600000, 0) / 1000,
                                    self._timer_order, fun))

    def _tick(self):
        if self._closed:
            return
        count = 0
        while self._timers and self._timers[0][0] <= time.monotonic() and count < 32:
            _, _, callback = heapq.heappop(self._timers)
            count += 1
            _bridge.dispatching = True
            try:
                _bridge.callback(callback)
            finally:
                _bridge.dispatching = False

    def _event(self, event):
        if self._closed:
            return
        kind = event.get("type")
        if kind == "close":
            self.bye()
        elif kind == "key":
            key = event.get("key")
            if not isinstance(key, str) or len(key) > 64:
                return
            key = {"ArrowLeft": "Left", "ArrowRight": "Right", "ArrowUp": "Up", "ArrowDown": "Down",
                   "Enter": "Return", " ": "space", "Escape": "Escape", "Backspace": "BackSpace"}.get(key, key)
            action = event.get("action", "down")
            callback = self._keys.get((action, key)) or self._keys.get((action, None))
            if callback:
                callback()
        elif kind == "click":
            x, y = event.get("x"), event.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return
            if not math.isfinite(x) or not math.isfinite(y) or max(abs(x), abs(y)) > 1000000:
                return
            button = event.get("button", 1)
            action = event.get("action", "click")
            target = next((item for item in self._turtles if item._id == event.get("target")), None)
            if target:
                for callback in list(target._events.get((action, button), [])):
                    callback(x, y)
            if action == "click":
                for callback in list(self._clicks.get(button, [])):
                    callback(x, y)

    def mainloop(self):
        self._show()
        self.update()
        previous = _bridge.wait_for_interaction("events")
        try:
            while not self._closed and not _bridge.closed:
                _bridge.pump(0.02)
        finally:
            _bridge.wait_for_interaction(previous)

    def exitonclick(self):
        self.onclick(lambda x, y: self.bye())
        self.mainloop()

    def bye(self):
        if self._visible and not self._closed:
            _bridge.emit({"type": "draw", "command": {"op": "close"}})
        self._closed = True

    def textinput(self, title, prompt):
        value = _bridge.request("text", title, prompt)
        return None if value is None else str(value)[:4096]

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        extra = {}
        for key, value in (("default", default), ("min", minval), ("max", maxval)):
            if value is not None:
                extra[key] = _number(value)
        while True:
            value = _bridge.request("number", title, prompt, **extra)
            if value is None:
                return None
            try:
                result = _number(value)
            except TurtleGraphicsError:
                continue
            if (minval is None or result >= minval) and (maxval is None or result <= maxval):
                return result

    def register_shape(self, name, shape=None):
        if not isinstance(name, str) or not re.fullmatch(r"[\w -]{1,64}", name):
            raise TurtleGraphicsError("形状名称无效。")
        if shape is None or isinstance(shape, str):
            _unsupported("图片形状")
        if isinstance(shape, Shape):
            if shape._type != "polygon":
                _unsupported("复合形状")
            shape = shape._data
        if not isinstance(shape, (tuple, list)) or not 3 <= len(shape) <= 256:
            raise TurtleGraphicsError("形状需要 3～256 个顶点。")
        points = [[_number(x), _number(y)] for x, y in shape]
        self._shapes[name] = points
        _emit("shape", name=name, points=points)

    addshape = register_shape

    def getshapes(self):
        return sorted(self._shapes)

    def getcanvas(self):
        return _unsupported("Tk Canvas")

    def bgpic(self, picname=None):
        if picname is None:
            return "nopic"
        return _unsupported("背景图片")


def Screen():
    global _screen
    if _screen is None:
        _screen = _Screen()
    return _screen


class Shape:
    def __init__(self, type_, data=None):
        if type_ not in ("polygon", "compound", "image"):
            raise TurtleGraphicsError("不支持的形状类型。")
        self._type, self._data = type_, data

    def addcomponent(self, poly, fill, outline=None):
        return _unsupported("复合形状")


class Turtle:
    def __init__(self, shape="classic", undobuffersize=1000, visible=True):
        self.screen = Screen()
        if len(self.screen._turtles) >= 128:
            raise TurtleGraphicsError("同一画布最多支持 128 只海龟。")
        self._id = _identity()
        self._events = {}
        self._undo = []
        self._undo_limit = 1000
        self._objects = []
        self._stamps = []
        self._poly = None
        self._last_poly = None
        self._fill_points = None
        self._fullcircle = 360.0
        self._reset_state()
        self._visible = bool(visible)
        self.setundobuffer(undobuffersize)
        if shape not in self.screen._shapes:
            raise TurtleGraphicsError("未知形状：" + str(shape))
        self._shape = shape
        self.screen._turtles.append(self)
        self._state()
        self.screen._step(False)

    def _reset_state(self):
        self._position = Vec2D(0, 0)
        self._heading = 90.0 if self.screen._mode == "logo" else 0.0
        self._down = True
        self._pencolor = self._fillcolor = "black"
        self._pensize = 1.0
        self._speed = 3
        self._visible = True
        self._shape = "classic"
        self._scale = [1.0, 1.0]
        self._outline = 1.0
        self._tilt = 0.0
        self._resize = "noresize"

    def _state(self):
        _emit("turtle", id=self._id, x=self._position[0], y=self._position[1],
              heading=(self._heading + self._tilt) % 360, visible=self._visible,
              shape=self._shape, pencolor=self._pencolor, fillcolor=self._fillcolor,
              scale=self._scale, outline=self._outline)

    def _remember(self, state, objects):
        if self._undo_limit:
            self._undo.append((state, objects))
            if len(self._undo) > self._undo_limit:
                del self._undo[0]

    def _draw(self, op, **values):
        identity = _identity()
        self._objects.append(identity)
        _emit(op, id=identity, turtle=self._id, **values)
        return identity

    def _move(self, x, y):
        target = Vec2D(_number(x, "横坐标"), _number(y, "纵坐标"))
        start = self._position
        distance = abs(target - start)
        segments = 1 if self._speed == 0 or self.screen._tracer != 1 else min(200, max(1, math.ceil(distance / (4 + self._speed * 3))))
        objects = []
        for index in range(1, segments + 1):
            current = start + (target - start) * (index / segments)
            if self._down:
                objects.append(self._draw("line", x1=self._position[0], y1=self._position[1],
                                          x2=current[0], y2=current[1], color=self._pencolor, width=self._pensize))
            self._position = current
            self._state()
            self.screen._step(self._speed != 0)
        if self._fill_points is not None:
            self._fill_points.append(list(target))
            if len(self._fill_points) > 2048:
                raise TurtleGraphicsError("单个填充图形的顶点过多。")
        if self._poly is not None:
            self._poly.append(tuple(target))
        self._remember(("position", start), objects)

    def forward(self, distance):
        distance = _number(distance, "距离")
        angle = math.radians(self._heading)
        self._move(self._position[0] + distance * math.cos(angle), self._position[1] + distance * math.sin(angle))

    fd = forward

    def backward(self, distance):
        self.forward(-_number(distance, "距离"))

    back = bk = backward

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move(x, y)

    setpos = setposition = goto

    def setx(self, x):
        self.goto(x, self._position[1])

    def sety(self, y):
        self.goto(self._position[0], y)

    def right(self, angle):
        self._turn(-_number(angle, "角度") * 360 / self._fullcircle)

    rt = right

    def left(self, angle):
        self._turn(_number(angle, "角度") * 360 / self._fullcircle)

    lt = left

    def _turn(self, angle):
        before = self._heading
        self._heading = (before + angle) % 360
        self._state()
        self._remember(("heading", before), [])
        self.screen._step(self._speed != 0)

    def setheading(self, to_angle):
        angle = _number(to_angle, "角度") * 360 / self._fullcircle
        if self.screen._mode == "logo":
            angle = 90 - angle
        self._turn(angle - self._heading)

    seth = setheading

    def heading(self):
        heading = 90 - self._heading if self.screen._mode == "logo" else self._heading
        return (heading % 360) * self._fullcircle / 360

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def position(self):
        return Vec2D(*self._position)

    pos = position

    def xcor(self):
        return self._position[0]

    def ycor(self):
        return self._position[1]

    def towards(self, x, y=None):
        if isinstance(x, Turtle):
            x, y = x.position()
        elif y is None:
            x, y = x
        angle = math.degrees(math.atan2(_number(y) - self.ycor(), _number(x) - self.xcor()))
        if self.screen._mode == "logo":
            angle = 90 - angle
        return (angle % 360) * self._fullcircle / 360

    def distance(self, x, y=None):
        if isinstance(x, Turtle):
            x, y = x.position()
        elif y is None:
            x, y = x
        return math.hypot(_number(x) - self.xcor(), _number(y) - self.ycor())

    def degrees(self, fullcircle=360.0):
        self._fullcircle = _number(fullcircle, "完整圆周角度", 1000000, 0.000001)

    def radians(self):
        self.degrees(2 * math.pi)

    def circle(self, radius, extent=None, steps=None):
        radius = _number(radius, "半径")
        extent = self._fullcircle if extent is None else _number(extent, "圆弧角度")
        degree_extent = extent * 360 / self._fullcircle
        steps = max(1, math.ceil(abs(degree_extent) / 8)) if steps is None else int(_number(steps, "圆弧分段", 2047, 1))
        if steps > 2047:
            raise TurtleGraphicsError("圆弧分段过多。")
        start = self.position()
        heading = self._heading
        center_angle = math.radians(heading + 90)
        cx, cy = start[0] + radius * math.cos(center_angle), start[1] + radius * math.sin(center_angle)
        direction = 1 if radius >= 0 else -1
        start_angle = math.atan2(start[1] - cy, start[0] - cx)
        for index in range(1, steps + 1):
            arc = math.radians(degree_extent * direction * index / steps)
            self._heading = (heading + math.degrees(arc)) % 360
            self._move(cx + abs(radius) * math.cos(start_angle + arc), cy + abs(radius) * math.sin(start_angle + arc))

    def speed(self, speed=None):
        if speed is None:
            return self._speed
        speeds = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        value = speeds.get(speed, speed) if isinstance(speed, str) else speed
        value = round(_number(value, "速度"))
        self._speed = value if 0 <= value <= 10 else 0

    def penup(self):
        self._down = False

    pu = up = penup

    def pendown(self):
        self._down = True

    pd = down = pendown

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._pensize
        self._pensize = _number(width, "画笔宽度", 100, 0.01)

    width = pensize

    def pencolor(self, *args):
        if not args:
            return self._pencolor
        self._pencolor = _color(args[0] if len(args) == 1 else args)
        self._state()
        self.screen._step(False)

    def fillcolor(self, *args):
        if not args:
            return self._fillcolor
        self._fillcolor = _color(args[0] if len(args) == 1 else args)
        self._state()
        self.screen._step(False)

    def color(self, *args):
        if not args:
            return (self._pencolor, self._fillcolor)
        if len(args) == 2:
            self._pencolor, self._fillcolor = _color(args[0]), _color(args[1])
        else:
            self._pencolor = self._fillcolor = _color(args[0] if len(args) == 1 else args)
        self._state()
        self.screen._step(False)

    def begin_fill(self):
        self._fill_points = [list(self.position())]

    def filling(self):
        return self._fill_points is not None

    def end_fill(self):
        if self._fill_points is not None and len(self._fill_points) >= 3:
            identity = self._draw("polygon", points=self._fill_points, fill=self._fillcolor,
                                  stroke=self._pencolor, width=self._pensize)
            self._remember(None, [identity])
            self.screen._step(False)
        self._fill_points = None

    def dot(self, size=None, *color):
        size = max(self._pensize + 4, self._pensize * 2) if size is None else _number(size, "圆点大小", 1000, 0.01)
        fill = _color(color[0] if len(color) == 1 else color) if color else self._pencolor
        identity = self._draw("dot", x=self.xcor(), y=self.ycor(), size=size, color=fill)
        self._remember(None, [identity])
        self.screen._step(False)

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        if move:
            # Browser and system font metrics differ; do not invent a cursor
            # position on which subsequent teaching code could rely.
            _unsupported("write(move=True) 的原生字体测量")
        if align not in ("left", "center", "right"):
            raise TurtleGraphicsError("文字对齐方式应为 left、center 或 right。")
        if not isinstance(font, (list, tuple)) or len(font) != 3:
            raise TurtleGraphicsError("字体应为（字体名、大小、样式）。")
        text = str(arg)
        if len(text) > 8192:
            raise TurtleGraphicsError("单段文字过长。")
        family, size, style = str(font[0])[:128], _number(font[1], "字体大小", 128, 1), str(font[2])[:64]
        identity = self._draw("text", x=self.xcor(), y=self.ycor(), text=text, color=self._pencolor,
                             font=[family, size, style], align=align)
        self._remember(None, [identity])
        self.screen._step(False)

    def clear(self):
        _emit("clear", turtle=self._id)
        self._objects, self._stamps, self._undo = [], [], []
        self._fill_points = self._poly = self._last_poly = None
        self.screen._step(False)

    def reset(self):
        self.clear()
        self._reset_state()
        self._state()
        self.screen._step(False)

    def hideturtle(self):
        self._visible = False
        self._state()
        self.screen._step(False)

    ht = hideturtle

    def showturtle(self):
        self._visible = True
        self._state()
        self.screen._step(False)

    st = showturtle

    def isvisible(self):
        return self._visible

    def shape(self, name=None):
        if name is None:
            return self._shape
        if name not in self.screen._shapes:
            raise TurtleGraphicsError("未知形状：" + str(name))
        self._shape = name
        self._state()
        self.screen._step(False)

    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):
        if stretch_wid is None and stretch_len is None and outline is None:
            return (*self._scale, self._outline)
        if stretch_wid is not None:
            self._scale[0] = _number(stretch_wid, "形状宽度", 100, 0.01)
        if stretch_len is not None:
            self._scale[1] = _number(stretch_len, "形状长度", 100, 0.01)
        elif stretch_wid is not None:
            self._scale[1] = self._scale[0]
        if outline is not None:
            self._outline = _number(outline, "轮廓宽度", 100, 0)
        self._resize = "user"
        self._state()
        self.screen._step(False)

    turtlesize = shapesize

    def resizemode(self, rmode=None):
        if rmode is None:
            return self._resize
        if rmode not in ("auto", "user", "noresize"):
            raise TurtleGraphicsError("缩放模式无效。")
        if rmode == "auto":
            _unsupported("resizemode('auto')")
        self._resize = rmode

    def tilt(self, angle):
        self.settiltangle(self.tiltangle() + _number(angle))

    def settiltangle(self, angle):
        self._tilt = (_number(angle) * 360 / self._fullcircle) % 360
        self._state()
        self.screen._step(False)

    def tiltangle(self, angle=None):
        if angle is not None:
            self.settiltangle(angle)
        return self._tilt * self._fullcircle / 360

    def begin_poly(self):
        self._poly = [tuple(self.position())]

    def end_poly(self):
        self._last_poly = tuple(self._poly) if self._poly else None
        self._poly = None

    def get_poly(self):
        return self._last_poly

    def get_shapepoly(self):
        points = self.screen._shapes.get(self._shape)
        if points is None:
            _unsupported("内置海龟形状的原生顶点查询")
        return tuple(tuple(point) for point in points)

    def stamp(self):
        points = self.screen._shapes.get(self._shape)
        if points is None:
            # Match the graphical adapter's simple built-in silhouettes.
            points = {"square": [[-10,-10],[10,-10],[10,10],[-10,10]],
                      "triangle": [[12,0],[-8,9],[-8,-9]],
                      "arrow": [[12,0],[-10,8],[-5,0],[-10,-8]],
                      "classic": [[10,0],[-8,5],[-5,0],[-8,-5]]}.get(self._shape)
            if points is None:
                if self._shape == "circle":
                    points = [[10*math.cos(a*math.tau/24), 10*math.sin(a*math.tau/24)] for a in range(24)]
                else:
                    points = [[14,0],[7,4],[8,9],[3,8],[-3,8],[-8,10],[-8,4],[-11,0],[-8,-4],[-8,-10],[-3,-8],[3,-8],[8,-9],[7,-4]]
        heading = math.radians(self._heading + self._tilt)
        transformed = []
        for px, py in points:
            px, py = px * self._scale[1], py * self._scale[0]
            transformed.append([self.xcor()+px*math.cos(heading)-py*math.sin(heading),
                                self.ycor()+px*math.sin(heading)+py*math.cos(heading)])
        identity = self._draw("polygon", points=transformed, fill=self._fillcolor,
                             stroke=self._pencolor, width=max(0.01, self._outline))
        self._stamps.append(identity)
        self._remember(None, [identity])
        self.screen._step(False)
        return identity

    def clearstamp(self, stampid):
        if stampid in self._stamps:
            self._stamps.remove(stampid)
            _emit("remove", ids=[stampid])
            self.screen._step(False)

    def clearstamps(self, n=None):
        ids = self._stamps[:] if n is None else self._stamps[:int(n)] if n >= 0 else self._stamps[int(n):]
        for identity in ids:
            self.clearstamp(identity)

    def clone(self):
        result = Turtle(self._shape, self._undo_limit, self._visible)
        for field in ("_position", "_heading", "_down", "_pencolor", "_fillcolor", "_pensize", "_speed", "_outline", "_tilt", "_fullcircle"):
            setattr(result, field, getattr(self, field))
        result._scale = self._scale[:]
        result._state()
        result.screen._step(False)
        return result

    def setundobuffer(self, size):
        self._undo_limit = 0 if size is None else int(_number(size, "撤销记录数", 1000, 0))
        self._undo = []

    def undobufferentries(self):
        return len(self._undo)

    def undo(self):
        if not self._undo:
            return
        state, objects = self._undo.pop()
        if objects:
            _emit("remove", ids=objects)
            self._objects = [identity for identity in self._objects if identity not in objects]
        if state:
            if state[0] == "position":
                self._position = state[1]
            elif state[0] == "heading":
                self._heading = state[1]
            self._state()
        self.screen._step(False)

    def _bind(self, fun, btn, add, action):
        btn = int(_number(btn, "鼠标按键", 3, 1))
        key = (action, btn)
        if fun is None:
            self._events.pop(key, None)
        elif callable(fun):
            self._events[key] = (self._events.get(key, []) if add else []) + [fun]
        else:
            raise TypeError("鼠标回调必须是函数。")

    def onclick(self, fun, btn=1, add=None):
        self._bind(fun, btn, add, "click")

    def onrelease(self, fun, btn=1, add=None):
        self._bind(fun, btn, add, "release")

    def ondrag(self, fun, btn=1, add=None):
        self._bind(fun, btn, add, "drag")

    def getscreen(self):
        return self.screen

    def getturtle(self):
        return self

    getpen = getturtle

    def pen(self, pen=None, **pendict):
        if pen is None and not pendict:
            return {"shown": self._visible, "pendown": self._down, "pencolor": self._pencolor,
                    "fillcolor": self._fillcolor, "pensize": self._pensize, "speed": self._speed,
                    "resizemode": self._resize, "stretchfactor": tuple(self._scale), "outline": self._outline,
                    "tilt": self._tilt}
        settings = dict(pen or {})
        settings.update(pendict)
        for key, value in settings.items():
            if key == "shown":
                self._visible = bool(value)
            elif key == "pendown":
                self._down = bool(value)
            elif key == "stretchfactor":
                self.shapesize(*value)
            elif key == "outline":
                self.shapesize(outline=value)
            elif key == "tilt":
                self.settiltangle(value)
            elif key in ("pencolor", "fillcolor", "pensize", "speed", "resizemode"):
                getattr(self, key)(value)
            else:
                _unsupported("pen 参数 " + str(key))
        self._state()
        self.screen._step(False)


Pen = Turtle


def RawTurtle(*args, **kwargs):
    return _unsupported("RawTurtle / 原生 Tk 画布")


RawPen = RawTurtle


def TurtleScreen(*args, **kwargs):
    return _unsupported("TurtleScreen / 原生 Tk 画布")


def ScrolledCanvas(*args, **kwargs):
    return _unsupported("ScrolledCanvas / 原生 Tk 画布")


def _get_default():
    global _default_turtle
    if _default_turtle is None:
        _default_turtle = Turtle()
    return _default_turtle


def _function(name, screen=False):
    def wrapper(*args, **kwargs):
        return getattr(Screen() if screen else _get_default(), name)(*args, **kwargs)
    wrapper.__name__ = name
    return wrapper


_TURTLE_FUNCTIONS = ("forward fd backward back bk right rt left lt goto setpos setposition setx sety "
                     "setheading seth home circle speed position pos xcor ycor heading towards distance degrees radians "
                     "penup pu up pendown pd down isdown pensize width pencolor fillcolor color begin_fill end_fill filling "
                     "dot write clear reset hideturtle ht showturtle st isvisible shape shapesize turtlesize resizemode "
                     "tilt settiltangle tiltangle begin_poly end_poly get_poly get_shapepoly stamp clearstamp clearstamps "
                     "clone setundobuffer undobufferentries undo onclick onrelease ondrag getscreen getturtle getpen pen").split()
_SCREEN_FUNCTIONS = ("setup screensize window_width window_height title bgcolor colormode mode setworldcoordinates "
                     "tracer delay update turtles clearscreen resetscreen listen onscreenclick onkey onkeyrelease onkeypress "
                     "ontimer mainloop exitonclick bye textinput numinput register_shape addshape getshapes getcanvas bgpic").split()
for _name in _TURTLE_FUNCTIONS:
    globals()[_name] = _function(_name)
for _name in _SCREEN_FUNCTIONS:
    globals()[_name] = _function(_name, True)

done = mainloop
__all__ = _TURTLE_FUNCTIONS + _SCREEN_FUNCTIONS + ["Turtle", "Pen", "Screen", "RawTurtle", "RawPen", "TurtleScreen",
                                                 "ScrolledCanvas", "Shape", "Vec2D", "TurtleGraphicsError", "Terminator", "done"]


def _finish():
    if _screen and _screen._visible and not _screen._closed:
        _screen.update()


def __getattr__(name):
    if name.startswith("_"):
        raise AttributeError(name)
    raise NotImplementedError("网页海龟暂不支持 turtle." + name)
