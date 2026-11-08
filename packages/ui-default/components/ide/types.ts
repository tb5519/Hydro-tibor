export type IdeState = 'idle' | 'connecting' | 'starting' | 'compiling' | 'running' | 'waiting-input' | 'stopping' | 'finished' | 'disconnected';
export type IdeWindowName = 'terminal' | 'graphics';
export interface IdeWindow {
  visible: boolean;
  minimized: boolean;
  maximized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TurtleCommand {
  op: string;
  [key: string]: any;
}
export interface IdeSnapshot {
  version: 1;
  revision: number;
  runId: string;
  state: IdeState;
  ready: boolean;
  message: string;
  /** Owner's IDE preference; older shared snapshots fall back to the default. */
  fontSize?: number;
  output: { stream: string; text: string }[];
  inputPending: boolean;
  inputDraft: string;
  inputErrorSeq: number;
  screen: { width: number; height: number; bg: string; title: string; world?: number[] };
  primitives: TurtleCommand[];
  turtles: TurtleCommand[];
  shapes: Record<string, number[][]>;
  request: TurtleCommand | null;
  activeWindow: IdeWindowName;
  windows: Record<IdeWindowName, IdeWindow>;
}
export type IdeCommand =
  | { type: 'run' }
  | { type: 'stop' }
  | { type: 'input'; text: string }
  | { type: 'input-draft'; text: string; target?: 'dialog'; requestId?: number }
  | { type: 'turtle-event'; event: Record<string, any> }
  | { type: 'window'; window: IdeWindowName; patch: Partial<IdeWindow> };

export function isIdeRunning(state: IdeState) {
  return ['starting', 'compiling', 'running', 'waiting-input', 'stopping'].includes(state);
}

export function emptyIdeSnapshot(): IdeSnapshot {
  return {
    version: 1, revision: 0, runId: '', state: 'idle', ready: false, message: '',
    output: [], inputPending: false, inputDraft: '', inputErrorSeq: 0,
    screen: { width: 640, height: 480, bg: '#ffffff', title: '海龟绘图' },
    primitives: [], turtles: [], shapes: {}, request: null,
    activeWindow: 'terminal',
    windows: {
      terminal: { visible: false, minimized: false, maximized: false, x: 0.78, y: 0, width: 560, height: 280 },
      graphics: { visible: false, minimized: false, maximized: false, x: 0.78, y: 0, width: 640, height: 520 },
    },
  };
}
