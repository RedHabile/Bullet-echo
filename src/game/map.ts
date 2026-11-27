// ── THE HOLLOW · deux plans de l'asile, pathfinding, raycasting ─────────────
import { TILE } from "./types";

export interface Prop { x: number; y: number; w: number; h: number; kind: string; }

export interface GameMap {
  w: number; h: number;
  grid: Uint8Array;
  pxW: number; pxH: number;
  variant: number;
  name: string;
  spawnP: { x: number; y: number };
  spawnK: { x: number; y: number };
  fuseSpots: { x: number; y: number }[];
  weaponSpots: { x: number; y: number }[];
  lockers: { x: number; y: number }[];
  lamps: { x: number; y: number; seed: number }[];
  exit: { x: number; y: number };
  waypoints: { x: number; y: number }[];
  pillars: { x: number; y: number }[];
  props: Prop[];
  moonTiles: { x: number; y: number }[];
  solidTile: (tx: number, ty: number) => boolean;
  solidAt: (px: number, py: number) => boolean;
  los: (x0: number, y0: number, x1: number, y1: number) => boolean;
  castFan: (x: number, y: number, dir: number, fov: number, radius: number, rays: number) => number[];
  path: (fx: number, fy: number, tx: number, ty: number) => { x: number; y: number }[];
  moveCircle: (x: number, y: number, r: number, dx: number, dy: number) => { x: number; y: number; hitX: boolean; hitY: boolean };
  nearestFloor: (px: number, py: number) => { x: number; y: number };
}

const W = 40, H = 30;
const C = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

interface Layout {
  name: string;
  rooms: [number, number, number, number][];
  pillars: { x: number; y: number }[];
  props: Prop[];
  spawnP: { x: number; y: number };
  spawnK: { x: number; y: number };
  exit: { x: number; y: number };
  fuseSpots: { x: number; y: number }[];
  weaponSpots: { x: number; y: number }[];
  lockers: { x: number; y: number }[];
  lamps: { x: number; y: number; seed: number }[];
  waypoints: { x: number; y: number }[];
  moonTiles: { x: number; y: number }[];
}

// ── plan 0 : l'asile ──
const ASYLUM: Layout = {
  name: "L'ASILE",
  rooms: [
    [1, 1, 6, 5], [8, 1, 8, 5], [17, 1, 7, 6], [25, 1, 7, 5], [33, 1, 6, 5],
    [5, 8, 13, 7], [20, 8, 8, 6], [33, 8, 6, 6],
    [5, 16, 6, 6], [13, 16, 6, 6], [20, 15, 8, 8], [33, 15, 6, 7],
    [16, 25, 8, 3],
    [5, 6, 30, 2], [2, 7, 3, 16], [30, 7, 3, 16], [18, 14, 2, 9], [2, 23, 36, 2],
  ],
  pillars: [
    { x: 8, y: 10 }, { x: 14, y: 10 }, { x: 8, y: 12 }, { x: 14, y: 12 },
    { x: 23, y: 17 }, { x: 25, y: 19 },
  ],
  props: [
    { x: 9, y: 2, w: 1, h: 2, kind: "bed" }, { x: 13, y: 2, w: 1, h: 2, kind: "bed" },
    { x: 26, y: 2, w: 1, h: 2, kind: "bed" }, { x: 30, y: 2, w: 1, h: 2, kind: "bed" },
    { x: 34, y: 1, w: 3, h: 1, kind: "shelf" },
    { x: 34, y: 9, w: 1, h: 2, kind: "slab" }, { x: 37, y: 9, w: 1, h: 2, kind: "slab" },
    { x: 21, y: 15, w: 2, h: 2, kind: "boiler" },
    { x: 6, y: 17, w: 2, h: 1, kind: "bench" },
    { x: 6, y: 9, w: 2, h: 1, kind: "shelf" },
    { x: 22, y: 9, w: 2, h: 1, kind: "table" },
    { x: 14, y: 17, w: 1, h: 1, kind: "crate" }, { x: 35, y: 16, w: 1, h: 1, kind: "barrel" },
    { x: 3, y: 9, w: 1, h: 1, kind: "barrel" },
  ],
  spawnP: C(2, 2), spawnK: C(24, 18), exit: C(19, 27),
  fuseSpots: [
    C(4, 4),
    C(10, 3), C(20, 2), C(28, 3), C(36, 4),
    C(7, 11), C(16, 12), C(23, 10), C(35, 12),
    C(7, 19), C(15, 19), C(25, 20), C(36, 18), C(10, 24),
  ],
  weaponSpots: [C(20, 4), C(11, 12), C(35, 20), C(8, 23), C(24, 21)],
  lockers: [C(37, 2), C(37, 12), C(6, 20), C(21, 18), C(13, 9), C(34, 20), C(17, 26)],
  lamps: [
    { ...C(19, 7), seed: 1.7 }, { ...C(11, 23), seed: 4.2 }, { ...C(31, 15), seed: 8.9 },
    { ...C(3, 15), seed: 13.4 }, { ...C(19, 26), seed: 21.1 }, { ...C(11, 10), seed: 33.3 },
  ],
  waypoints: [
    C(3, 3), C(11, 3), C(20, 3), C(28, 3), C(36, 3),
    C(11, 11), C(24, 10), C(36, 11), C(7, 18), C(15, 18),
    C(24, 18), C(36, 18), C(10, 23), C(28, 23), C(19, 26), C(3, 15), C(31, 15), C(19, 18),
  ],
  moonTiles: [{ x: 12, y: 1 }, { x: 27, y: 1 }, { x: 2, y: 12 }, { x: 37, y: 17 }],
};

// ── plan 1 : le quartier des cellules ──
const CELLS: Layout = {
  name: "LES CELLULES",
  rooms: [
    [2, 13, 36, 4],
    [3, 3, 4, 6], [9, 3, 4, 6], [15, 3, 4, 6], [21, 3, 4, 6], [27, 3, 4, 6], [33, 3, 4, 6],
    [2, 9, 36, 2],
    [4, 11, 2, 2], [16, 11, 2, 2], [30, 11, 2, 2],
    [3, 19, 8, 6], [13, 19, 12, 7], [27, 19, 10, 6],
    [6, 17, 2, 2], [18, 17, 2, 2], [31, 17, 2, 2],
    [17, 26, 6, 2],
  ],
  pillars: [{ x: 16, y: 21 }, { x: 21, y: 23 }],
  props: [
    { x: 5, y: 3, w: 1, h: 2, kind: "bed" },
    { x: 9, y: 3, w: 1, h: 2, kind: "bed" }, { x: 15, y: 3, w: 1, h: 2, kind: "bed" },
    { x: 21, y: 3, w: 1, h: 2, kind: "bed" }, { x: 27, y: 3, w: 1, h: 2, kind: "bed" },
    { x: 33, y: 3, w: 1, h: 2, kind: "bed" },
    { x: 28, y: 19, w: 3, h: 1, kind: "shelf" },
    { x: 4, y: 20, w: 2, h: 1, kind: "bench" }, { x: 8, y: 23, w: 2, h: 1, kind: "bench" },
    { x: 14, y: 24, w: 1, h: 1, kind: "crate" }, { x: 23, y: 20, w: 1, h: 1, kind: "crate" },
    { x: 12, y: 13, w: 1, h: 1, kind: "barrel" }, { x: 26, y: 16, w: 1, h: 1, kind: "barrel" },
    { x: 33, y: 23, w: 2, h: 1, kind: "table" },
  ],
  spawnP: C(4, 4), spawnK: C(31, 22), exit: C(19, 27),
  fuseSpots: [
    C(4, 6),
    C(11, 4), C(17, 5), C(23, 4), C(29, 5), C(35, 4),
    C(5, 22), C(9, 21), C(15, 21), C(22, 24), C(30, 21), C(35, 23),
    C(10, 14), C(25, 15),
  ],
  weaponSpots: [C(20, 14), C(7, 22), C(20, 22), C(33, 20), C(11, 6)],
  lockers: [C(6, 8), C(18, 3), C(30, 8), C(4, 24), C(24, 19), C(36, 20), C(17, 26)],
  lamps: [
    { ...C(10, 14), seed: 2.3 }, { ...C(28, 14), seed: 6.1 }, { ...C(19, 22), seed: 9.7 },
    { ...C(6, 21), seed: 14.2 }, { ...C(33, 21), seed: 19.8 }, { ...C(19, 9), seed: 27.5 },
  ],
  waypoints: [
    C(4, 5), C(10, 5), C(16, 5), C(22, 5), C(28, 5), C(34, 5),
    C(8, 14), C(19, 14), C(31, 14), C(6, 22), C(19, 22), C(31, 22),
    C(19, 26), C(10, 9), C(28, 9), C(18, 18),
  ],
  moonTiles: [{ x: 10, y: 3 }, { x: 22, y: 3 }, { x: 34, y: 3 }, { x: 3, y: 20 }],
};

const LAYOUTS = [ASYLUM, CELLS];

export function buildMap(variant = 0): GameMap {
  const L = LAYOUTS[variant % LAYOUTS.length];
  const grid = new Uint8Array(W * H).fill(1);
  const carve = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (i > 0 && j > 0 && i < W - 1 && j < H - 1) grid[j * W + i] = 0;
  };
  for (const [x, y, w, h] of L.rooms) carve(x, y, w, h);
  for (const p of L.pillars) grid[p.y * W + p.x] = 1;
  // le mobilier est solide (couvertures tactiques)
  for (const pr of L.props)
    for (let j = pr.y; j < pr.y + pr.h; j++)
      for (let i = pr.x; i < pr.x + pr.w; i++) grid[j * W + i] = 1;

  const solidTile = (tx: number, ty: number) =>
    tx < 0 || ty < 0 || tx >= W || ty >= H || grid[ty * W + tx] === 1;
  const solidAt = (px: number, py: number) =>
    solidTile(Math.floor(px / TILE), Math.floor(py / TILE));

  const los = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solidAt(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  };

  const castFan = (x: number, y: number, dir: number, fov: number, radius: number, rays: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= rays; i++) {
      const a = dir - fov / 2 + (fov * i) / rays;
      const ca = Math.cos(a), sa = Math.sin(a);
      let d = 6;
      const step = 7;
      while (d < radius) {
        if (solidAt(x + ca * d, y + sa * d)) break;
        d += step;
      }
      d = Math.min(d + 10, radius);
      pts.push(x + ca * d, y + sa * d);
    }
    return pts;
  };

  const path = (fx: number, fy: number, tx: number, ty: number) => {
    const sx = Math.floor(fx / TILE), sy = Math.floor(fy / TILE);
    let gx = Math.floor(tx / TILE), gy = Math.floor(ty / TILE);
    if (solidTile(gx, gy)) {
      let best = Infinity, bx = gx, by = gy;
      for (let j = gy - 3; j <= gy + 3; j++)
        for (let i = gx - 3; i <= gx + 3; i++)
          if (!solidTile(i, j)) {
            const d = (i - gx) ** 2 + (j - gy) ** 2;
            if (d < best) { best = d; bx = i; by = j; }
          }
      gx = bx; gy = by;
    }
    if (solidTile(sx, sy) || (sx === gx && sy === gy)) return [{ x: tx, y: ty }];
    const prev = new Int32Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    const start = sy * W + sx, goal = gy * W + gx;
    q[tail++] = start; prev[start] = start;
    while (head < tail) {
      const cur = q[head++];
      if (cur === goal) break;
      const cx = cur % W, cy = (cur / W) | 0;
      const n = [cur - 1, cur + 1, cur - W, cur + W];
      const nx = [cx - 1, cx + 1, cx, cx];
      const ny = [cy, cy, cy - 1, cy + 1];
      for (let k = 0; k < 4; k++) {
        if (nx[k] < 0 || ny[k] < 0 || nx[k] >= W || ny[k] >= H) continue;
        if (grid[n[k]] === 1 || prev[n[k]] !== -1) continue;
        prev[n[k]] = cur; q[tail++] = n[k];
      }
    }
    if (prev[goal] === -1) return [];
    const out: { x: number; y: number }[] = [];
    let cur = goal;
    while (cur !== start) {
      out.push(C(cur % W, (cur / W) | 0));
      cur = prev[cur];
    }
    out.reverse();
    if (out.length) out[out.length - 1] = { x: tx, y: ty };
    return out;
  };

  const collideAxis = (x: number, y: number, r: number) => {
    const minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
    const minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++)
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!solidTile(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < r * r) return { tx, ty };
      }
    return null;
  };

  const moveCircle = (x: number, y: number, r: number, dx: number, dy: number) => {
    let hitX = false, hitY = false;
    let nx = x + dx;
    let c = collideAxis(nx, y, r);
    if (c) {
      hitX = true;
      nx = dx > 0 ? c.tx * TILE - r - 0.01 : c.tx * TILE + TILE + r + 0.01;
      if (collideAxis(nx, y, r)) nx = x;
    }
    let ny = y + dy;
    c = collideAxis(nx, ny, r);
    if (c) {
      hitY = true;
      ny = dy > 0 ? c.ty * TILE - r - 0.01 : c.ty * TILE + TILE + r + 0.01;
      if (collideAxis(nx, ny, r)) ny = y;
    }
    return { x: nx, y: ny, hitX, hitY };
  };

  const nearestFloor = (px: number, py: number) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (!solidTile(tx, ty)) return { x: px, y: py };
    for (let rad = 1; rad < 6; rad++)
      for (let j = ty - rad; j <= ty + rad; j++)
        for (let i = tx - rad; i <= tx + rad; i++)
          if (!solidTile(i, j)) return C(i, j);
    return L.spawnP;
  };

  return {
    w: W, h: H, grid, pxW: W * TILE, pxH: H * TILE,
    variant: variant % LAYOUTS.length, name: L.name,
    spawnP: L.spawnP, spawnK: L.spawnK,
    fuseSpots: L.fuseSpots, weaponSpots: L.weaponSpots,
    lockers: L.lockers, lamps: L.lamps, exit: L.exit,
    waypoints: L.waypoints, pillars: L.pillars, props: L.props, moonTiles: L.moonTiles,
    solidTile, solidAt, los, castFan, path, moveCircle, nearestFloor,
  };
}

export const MAP_COUNT = LAYOUTS.length;
