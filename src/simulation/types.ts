export type FlowMode =
  | 'heartPlanet'
  | 'nebula'
  | 'aurora'
  | 'orbital'
  | 'lattice'
  | 'fountain';

export type InteractionMode = 'swirl' | 'attract' | 'repel';

export type PaletteId = 'amber' | 'celadon' | 'dusk' | 'frost' | 'ink';

export interface PaletteConfig {
  id: PaletteId;
  name: string;
  isLight: boolean;
  backgroundHex: string;
  fogHex: string;
  /** Primary, secondary, highlight, and accent particle colors (hex) */
  colors: [string, string, string, string];
  /** Accent hex for active UI buttons & slider thumbs */
  accentHex: string;
  /** RGB tint for subtle shockwave ring */
  ringHex: string;
  /** Swatch preview CSS gradient */
  swatchGradient: string;
}

export interface AudioReactiveState {
  active: boolean;
  bass: number;
  mid: number;
  treble: number;
  level: number;
  beat: number;
  sensitivity: number;
}

export const SILENT_AUDIO_STATE: AudioReactiveState = {
  active: false,
  bass: 0,
  mid: 0,
  treble: 0,
  level: 0,
  beat: 0,
  sensitivity: 1.0,
};

export interface SimulationParams {
  flowMode: FlowMode;
  interactionMode: InteractionMode;
  paletteId: PaletteId;
  particleCount: number;
  flowSpeed: number;
  turbulence: number;
  interactionRadius: number;
  musicSensitivity: number;
  autoOrbit: boolean;
  paused: boolean;
}

export interface PointerFieldState {
  active: boolean;
  pressed: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
}

export interface ShockwavePulse {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  maxRadius: number;
  strength: number;
  age: number;
  duration: number;
}

export interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

export const MAX_PARTICLES = 8000;
export const MIN_PARTICLES = 1600;

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  flowMode: 'heartPlanet',
  interactionMode: 'swirl',
  paletteId: 'dusk',
  particleCount: 6400,
  flowSpeed: 1.0,
  turbulence: 1.0,
  interactionRadius: 3.4,
  musicSensitivity: 1.25,
  autoOrbit: true,
  paused: false,
};

export interface FlowModeOption {
  id: FlowMode;
  label: string;
  shortDesc: string;
}

export const FLOW_MODE_OPTIONS: FlowModeOption[] = [
  { id: 'heartPlanet', label: '爱心星球', shortDesc: '水波纹粒子地面之上悬浮跃动爱心星球' },
  { id: 'nebula', label: '星云涡流', shortDesc: '三维旋度场缓慢盘旋' },
  { id: 'aurora', label: '丝绸极光', shortDesc: '多层流光绸带舒展波动' },
  { id: 'orbital', label: '引力星环', shortDesc: '倾斜星环绕心优雅公转' },
  { id: 'lattice', label: '量子矩阵', shortDesc: '悬浮光点随波纹共振起伏' },
  { id: 'fountain', label: '星尘涌泉', shortDesc: '轻盈浮尘自底向上升腾舒散' },
];

export interface InteractionModeOption {
  id: InteractionMode;
  label: string;
  hint: string;
}

export const INTERACTION_MODE_OPTIONS: InteractionModeOption[] = [
  { id: 'swirl', label: '旋涡', hint: '搅动粒子形成旋转漩涡' },
  { id: 'attract', label: '引力', hint: '吸引周围粒子汇聚流向指针' },
  { id: 'repel', label: '排斥', hint: '拨开粒子产生清澈流体尾迹' },
];
