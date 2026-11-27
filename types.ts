// Shared constants and types for Bullet Echo.
import type { Skin } from "./skins";

export const W = 960;
export const H = 540;

// Playable arena (walls where player bullets echo back).
export const ARENA = { x0: 24, y0: 66, x1: 936, y1: 520 };

export type Phase = "menu" | "countdown" | "playing" | "paused" | "over";
export type Mode = "solo" | "duel";
export type EnemyKind = "drone" | "turret" | "hunter";
export type PickupKind = "rapid" | "spread" | "heart";

export const PALETTE = {
  bgTop: "#140b3a",
  bgBottom: "#05020f",
  grid: "rgba(94,242,255,0.07)",
  cyan: "#5ef2ff",
  magenta: "#ff3ea5",
  amber: "#ffb020",
  lime: "#9dff5a",
  violet: "#a78bfa",
  gold: "#ffd166",
  red: "#ff5470",
  white: "#f8fbff",
  ink: "#0b0622",
};

export const P_COLORS = [PALETTE.cyan, PALETTE.violet] as const;

export const ENEMY_COLORS: Record<EnemyKind, string> = {
  drone: PALETTE.lime,
  turret: PALETTE.magenta,
  hunter: PALETTE.amber,
};

export const KILL_POINTS: Record<EnemyKind, number> = {
  drone: 100,
  turret: 350,
  hunter: 250,
};

export const PICKUP_COLORS: Record<PickupKind, string> = {
  rapid: PALETTE.gold,
  spread: PALETTE.cyan,
  heart: PALETTE.red,
};

export interface Player {
  id: number;
  name: string;
  color: string;
  skin: Skin;
  echoKills: number;
  grazes: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  alive: boolean;
  lives: number;
  maxLives: number;
  score: number;
  kills: number;
  bestCombo: number;
  combo: number;
  comboT: number;
  mult: number;
  fireCd: number;
  invuln: number;
  rapid: number;
  spread: number;
  flash: number;
  recoil: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  owner: number; // 0/1 = player, -1 = enemy, -2 = attract (decorative)
  bounces: number;
  maxBounces: number;
  life: number;
  color: string;
  trail: { x: number; y: number }[];
  grazed: boolean;
  dead: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  speed: number;
  r: number;
  hp: number;
  maxHp: number;
  t: number;
  seed: number;
  aim: number;
  fireCd: number;
  spawn: number; // telegraph timer; > 0 means not yet active
  flash: number;
  color: string;
  dead: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: PickupKind;
  life: number;
  t: number;
  dead: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  spark: boolean;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

export interface Banner {
  text: string;
  color: string;
  sub: string;
  life: number;
  max: number;
}

export interface PlayerInput {
  mx: number;
  my: number;
  fire: boolean;
}

export interface TouchView {
  p: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export interface FrameInput {
  p: [PlayerInput, PlayerInput];
  mouse: { x: number; y: number; active: boolean; fire: boolean };
  touches: TouchView[];
}

export interface PlayerHud {
  name: string;
  color: string;
  score: number;
  lives: number;
  maxLives: number;
  mult: number;
  combo: number;
  comboT: number;
  alive: boolean;
  rapid: number;
  spread: number;
  kills: number;
  bestCombo: number;
}

export interface HudSnapshot {
  phase: Phase;
  mode: Mode;
  time: number;
  wave: number;
  players: PlayerHud[];
  overReady: boolean;
  bestLocal: number;
}

export interface RunSummary {
  mode: Mode;
  score: number;
  wave: number;
  time: number;
  winner: number;
  players: {
    name: string;
    color: string;
    score: number;
    kills: number;
    echoKills: number;
    grazes: number;
    bestCombo: number;
    alive: boolean;
  }[];
}
