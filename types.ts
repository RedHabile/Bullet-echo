// ── THE HOLLOW · types partagés & réglages ──────────────────────────────────

export type Mode = "solo" | "online";
export type Difficulty = "normal" | "nightmare";
export type Phase = "run" | "ending" | "done";
export type EndReason = "caught" | "escaped" | "timeup";
export type Role = "survivor" | "killer";
export type WeaponKind = "taser" | "flare";

export interface RunConfig {
  mode: Mode;
  difficulty: Difficulty;
  localRole: Role;
  variant: number; // 0 = asile, 1 = cellules
}

export const TILE = 48;
export const FUSES_NEEDED = 5;
export const ONLINE_TIME = 180; // le boucher gagne à 0
export const SOLO_PAR_TIME = 240;
export const GRACE_TIME = 4.2;

export interface Survivor {
  x: number; y: number; vx: number; vy: number;
  dir: number; stamina: number; exhausted: boolean; regenDelay: number;
  sprinting: boolean; moving: boolean; stepT: number; bob: number;
  hidden: number;
  alive: boolean; deathT: number;
  hideWitnessed: boolean;
}

export type Brain = "dormant" | "patrol" | "investigate" | "chase" | "search" | "ripopen" | "stunned";

export interface Killer {
  x: number; y: number; vx: number; vy: number;
  dir: number; stamina: number; exhausted: boolean; regenDelay: number;
  sprinting: boolean; moving: boolean; stepT: number; twitch: number;
  attackCd: number; attackAnim: number; senseCd: number; senseT: number;
  stunT: number;
  isBot: boolean;
  brain: Brain;
  path: { x: number; y: number }[];
  repathT: number;
  target: { x: number; y: number } | null;
  lastSeen: { x: number; y: number } | null;
  lostT: number; lookT: number; searchLeft: number;
  ripT: number; ripLocker: number;
}

export interface Fuse { x: number; y: number; taken: boolean; seed: number; }
export interface Locker { x: number; y: number; open: boolean; }
export interface WeaponItem { x: number; y: number; kind: WeaponKind; taken: boolean; seed: number; }
export interface Flare { x: number; y: number; t: number; seed: number; }

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  kind: "spark" | "blood" | "smoke" | "ash" | "dust" | "ember";
  grav: number;
}

export interface Popup { x: number; y: number; text: string; color: string; t: number; }
export interface Ring { x: number; y: number; r: number; max: number; color: string; t: number; }
export interface Stinger { text: string; sub: string; color: string; t: number; max: number; }

export interface Camera {
  x: number; y: number; zoom: number; shake: number; sx: number; sy: number;
  follow: Role;
}

export interface ScoreBreakdown {
  fuses: number; fusePts: number; chainPts: number; closeCalls: number; closePts: number;
  stuns: number; stunPts: number;
  escapePts: number; timePts: number; mult: number; total: number;
  timeSec: number; escaped: boolean;
}

export interface RunStats {
  fuses: number; stuns: number; closeCalls: number; hides: number; flares: number;
  timeSec: number; escaped: boolean; win: boolean; mode: Mode;
}

export interface EndPayload {
  reason: EndReason;
  config: RunConfig;
  score: ScoreBreakdown;
  killerWinner: boolean;
  stats: RunStats;
}

export interface HudData {
  fuses: number; needed: number; score: number; timeLabel: string; countdown: boolean;
  danger: number; chase: boolean; staminaS: number; staminaK: number;
  exhaustedS: boolean; exhaustedK: boolean;
  hidden: boolean; gateOpen: boolean; prompt: string;
  senseReady: number; attackReady: number;
  intro: number;
  role: Role; taser: number; flare: number; stunned: boolean; online: boolean;
}

export type EngineEvent =
  | { type: "end"; payload: EndPayload }
  | { type: "caught-flash" };

// ── réseau ──
export interface NetEvent {
  k: string; x?: number; y?: number; v?: number; s?: string; c?: string;
}

export interface SnapEntity {
  x: number; y: number; dir: number; stam: number; exh: boolean; spr: boolean; mov: boolean;
}

export interface Snapshot {
  t: number; phase: Phase; time: number; intro: number;
  s: SnapEntity & { hid: number; alive: boolean; bob: number; deathT: number };
  k: SnapEntity & { brain: Brain; atk: number; senseT: number; stunT: number; tw: boolean };
  f: number[]; lock: number[]; w: number[]; fc: number; gate: boolean;
  danger: number; chase: boolean;
  inv: { taser: number; flare: number };
  flares: { x: number; y: number; t: number; seed: number }[];
  reason: EndReason | null; kw: boolean; endT: number; slow: number;
  ev: NetEvent[];
}

export interface SessionSetup {
  difficulty: Difficulty;
  variant: number;
  hostRole: Role;
  fuses: { x: number; y: number }[];
  weapons: { x: number; y: number; kind: WeaponKind }[];
  hostSkin: string;
  hostLamp: string;
}

export interface NetInputMsg {
  mx: number; my: number; sprint: boolean;
  ac: number; sc: number; tc: number; fc: number; // compteurs d'actions
}

export const COLORS = {
  bg: "#04050a",
  blood: "#a3122a",
  bloodBright: "#ff2b3f",
  bone: "#d9d2c0",
  amber: "#ffb347",
  amberDim: "#8a5a1e",
  teal: "#39d3b8",
  green: "#5dff9d",
  fog: "#7d93a8",
};

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const angLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
