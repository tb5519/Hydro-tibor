import { IdeSnapshot, TurtleCommand } from './types';

const SVG = 'http://www.w3.org/2000/svg';
const color = (value: any, fallback = '#334155') => typeof value === 'string'
  && /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]{1,32})$/i.test(value) ? value : fallback;
function node(tag: string, attrs: Record<string, any>) {
  const result = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, String(value));
  return result;
}
export function createTurtleRenderer(svg: SVGSVGElement) {
  let previousPrimitives: TurtleCommand[] | null = null;
  let previousTurtles: TurtleCommand[] | null = null;
  let previousScreen = '';
  const drawing = node('g', {});
  const cursors = node('g', {});
  svg.append(drawing, cursors);
  function render(state: IdeSnapshot) {
    const s = state.screen;
    const width = Number(s.width) || 640;
    const height = Number(s.height) || 480;
    const world = s.world?.length === 4 ? s.world : [-width / 2, -height / 2, width / 2, height / 2];
    const scaleX = width / (world[2] - world[0]);
    const scaleY = height / (world[3] - world[1]);
    const x = (n: number) => (n - world[0]) * scaleX;
    const y = (n: number) => height - (n - world[1]) * scaleY;
    const screenKey = JSON.stringify(s);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.backgroundColor = color(s.bg, '#ffffff');
    if (previousPrimitives !== state.primitives || previousScreen !== screenKey) {
      const fragment = document.createDocumentFragment();
      for (const command of state.primitives) {
        let shape: Element | undefined;
        if (command.op === 'line') shape = node('line', { x1: x(command.x1), y1: y(command.y1),
          x2: x(command.x2), y2: y(command.y2), stroke: color(command.color), 'stroke-width': command.width, 'stroke-linecap': 'round' });
        else if (command.op === 'polygon') shape = node('polygon', {
          points: command.points.map((p: number[]) => `${x(p[0])},${y(p[1])}`).join(' '),
          fill: color(command.fill, 'none'), stroke: color(command.stroke, 'none'), 'stroke-width': command.width, 'stroke-linejoin': 'round',
        });
        else if (command.op === 'dot') shape = node('circle', { cx: x(command.x), cy: y(command.y), r: command.size / 2, fill: color(command.color) });
        else if (command.op === 'text') {
          shape = node('text', { x: x(command.x), y: y(command.y), fill: color(command.color),
            'font-family': String(command.font?.[0] || 'sans-serif'), 'font-size': command.font?.[1] || 12,
            'font-weight': String(command.font?.[2] || '').includes('bold') ? 'bold' : 'normal',
            'font-style': String(command.font?.[2] || '').includes('italic') ? 'italic' : 'normal',
            'text-anchor': command.align === 'right' ? 'end' : command.align === 'center' ? 'middle' : 'start',
          });
          shape.textContent = command.text;
        }
        if (shape) fragment.append(shape);
      }
      drawing.replaceChildren(fragment);
      previousPrimitives = state.primitives;
    }
    if (previousTurtles !== state.turtles || previousScreen !== screenKey) {
      const fragment = document.createDocumentFragment();
      for (const turtle of state.turtles) {
        if (!turtle.visible) continue;
        const group = node('g', { 'data-ide-turtle': turtle.id,
          transform: `translate(${x(turtle.x)} ${y(turtle.y)}) rotate(${-turtle.heading}) scale(${turtle.scale?.[1] || 1} ${turtle.scale?.[0] || 1})`,
          fill: color(turtle.fillcolor, '#77b9a0'), stroke: color(turtle.pencolor), 'stroke-width': turtle.outline ?? 1, 'stroke-linejoin': 'round' });
        const points = state.shapes?.[turtle.shape];
        if (Array.isArray(points)) group.append(node('polygon', { points: points.map((p: number[]) => `${p[0]},${-p[1]}`).join(' ') }));
        else if (turtle.shape === 'circle') group.append(node('circle', { r: 10 }));
        else if (turtle.shape === 'square') group.append(node('rect', { x: -10, y: -10, width: 20, height: 20 }));
        else if (turtle.shape === 'turtle') {
          group.append(node('path', { d: 'M 8 -3 L 13 -3 Q 17 0 13 3 L 8 3 L 4 7 L 4 12 L 0 11 L -2 7 L -6 7 L -10 11 L -12 8 L -9 4 L -12 0 L -9 -4 L -12 -8 L -10 -11 L -6 -7 L -2 -7 L 0 -11 L 4 -12 L 4 -7 Z' }));
          group.append(node('ellipse', { cx: -1, rx: 8, ry: 6, fill: color(turtle.fillcolor, '#77b9a0') }));
        } else if (turtle.shape === 'triangle') group.append(node('polygon', { points: '12,0 -8,-10 -8,10' }));
        else group.append(node('polygon', { points: '12,0 -7,-6 -3,0 -7,6' }));
        fragment.append(group);
      }
      cursors.replaceChildren(fragment);
      previousTurtles = state.turtles;
    }
    previousScreen = screenKey;
  }
  function point(event: PointerEvent, state: IdeSnapshot) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const { width, height } = state.screen;
    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return null;
    const w = state.screen.world || [-width / 2, -height / 2, width / 2, height / 2];
    return { x: w[0] + (p.x / width) * (w[2] - w[0]), y: w[3] - (p.y / height) * (w[3] - w[1]) };
  }
  return { render, point };
}
