# Isolated Python teaching runtime

Copy `transport.py` to `/w/ide_transport.py`, `bootstrap.py` to
`/w/ide_bootstrap.py`, `turtle.py` to `/w/turtle.py` and the student's code to
`/w/main.py`. Run `/usr/bin/python3 -u /w/ide_transport.py /usr/bin/python3 -u
/w/ide_bootstrap.py /w/main.py` in the independent IDE sandbox. Python source
must never execute in the Hydro process or on an unrestricted host.

Go-judge 1.9.4 supports streaming only in TTY mode. Configure `tty:true` with
one `streamIn` (fd 0) and one `streamOut` (fd 1). The outer transport makes that
TTY raw and multiplexes child pipes through JSONL. Its first output is
`{ready:true}`: the backend must wait for it before accepting stdin or emitting
the running state, preventing early input from being echoed by the TTY.
Subsequent output is `{fd:1|2|3,data:base64}`; input is `{fd:0|4,data:base64}`.
Input lines are at most 32 KiB, decoded input packets at most 16 KiB; output
packets contain at most 8 KiB of decoded bytes. The adapter preserves the
child's exit status and buffers with backpressure. C/C++ execution uses the
same transport with `/w/main` as its child command. The child's descriptors
retain the following meaning; graphics are not mixed into student stdout.
For C/C++ set `ONEBYONE_IDE_DETECT_STDIN=1`: on Linux the parent inspects each
child thread's `/proc/<pid>/task/<tid>/syscall` every 20 ms and emits input/input-end
only around an actual `read(0)`/`readv(0)`. An empty program does not open a
terminal. The deployment must verify that this process metadata is readable;
platforms without it need the manual terminal input entry. C/C++ also run with
`stdbuf -o0 -e0` so standard C output reaches the UI without pipe buffering.

Descriptors: 0 standard input, 1 standard output, 2 standard error, 3 graphical
JSONL output, 4 graphical JSONL input. `ONEBYONE_IDE_GRAPHICS_FD` and
`ONEBYONE_IDE_EVENTS_FD` optionally override 3/4 for tests. Do not merge the
graphics protocol into stdout or trust its contents simply because it came
from this adapter: student code can write directly to any of these descriptors.

Each fd 3 line is one of:

- `{type:"input",prompt?:string}`: stdin is waiting; prompt is at most 4096
  characters, while its normal terminal rendering remains on stdout.
- `{type:"input-end"}`: that input wait finished (including EOF/error).
- `{type:"draw",command:DrawingCommand}`.

Drawing commands use x-right/y-up logical coordinates. Default world bounds
are `[-400,-300,400,300]` for an 800 × 600 display. Coordinates are finite with
absolute value ≤ 1,000,000. Ids are positive safe integers, generated per run.
The default turtle points east (heading 0), positive turns are anticlockwise.
Heading is always in degrees on the wire, regardless of `degrees/radians`.

| op | fields |
| --- | --- |
| screen | `width,height` (64–1600), `bg` (color), `title` (≤256 chars), `world:[xmin,ymin,xmax,ymax]` (positive nonzero extents) |
| line | `id,turtle,x1,y1,x2,y2,color,width` (width >0, ≤100) |
| polygon | `id,turtle,points:[[x,y],…]` (≤2048 points), `fill,stroke` (color or empty), `width` |
| dot | `id,turtle,x,y,size` (>0, ≤1000), `color` |
| text | `id,turtle,x,y,text` (≤8192 chars), `color,font:[family,size,style],align` (left/center/right); family ≤128, size 1–128, style ≤64 |
| turtle | `id,x,y,heading,visible,shape,pencolor,fillcolor,scale:[width,length],outline`; shape is arrow/turtle/circle/square/triangle/classic or a registered polygon name (≤64 chars), scale >0 ≤100, outline 0–100 |
| shape | `name` (≤64 chars), `points:[[x,y],…]` (3–256 points); SVG polygon coordinate system, x-right/y-up |
| clear | optional `turtle`; omitted clears all drawn objects but leaves cursors |
| remove | `ids:[id,…]` (≤4096): remove specific drawn objects |
| update | no fields: render pending changes; ordinary drawing sends this automatically; tracer(0) only sends on explicit update/end |
| request | `id,kind` (text/number), `title` (≤256), `prompt` (≤4096), optional numeric `default,min,max`; asks for a page dialog |
| close | no fields: close drawing panel and end its event loop |

Colors are CSS-compatible named colors (ASCII letters only, up to 32 chars),
`#rrggbb`, or `#rgb`. Reject URL/HTML/CSS expressions. Backend and frontend
enforce their own object count / byte / rate limits. A single line is ≤64 KiB.
`id` is unique for each object; `turtle` identifies ownership for clear/undo.
Commands are ordered and never replayed as a second Python execution.

Fd 4 accepts:

- `{type:"click",x,y,button:1|2|3,target?:turtleId,action?:"click"|"release"|"drag"}`.
- `{type:"key",key:string,action:"down"|"up"}`; key ≤64 chars, browser names
  such as ArrowLeft/Enter/space are normalized to turtle Left/Return/space.
- `{type:"close"}`: equivalent to turtle `bye()`, stops the graphical event loop.
- `{type:"response",id,value:string|number|null}`: resolves a matching dialog.
  String values ≤4096 chars; numeric values must be finite.

Bridge callbacks run on the Python program's thread. They are serviced during
animations, `done/mainloop`, and text stdin waits; CPU-bound user loops still
require the runner's enforced CPU limit and Stop action. Terminal-only code
does not import or construct turtle. Importing turtle alone sends no graphics.

The adapter covers teaching turtle APIs and explicitly raises
`NotImplementedError` for Tk widgets, image shapes, sound, and unsupported
low-level APIs. It is not the native Tk turtle implementation.
