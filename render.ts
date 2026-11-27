// Canvas rendering for Bullet Echo. Uses pre-baked glow sprites and additive blending
// instead of shadowBlur so the frame budget stays comfortably under 16ms.
import type { Engine } from "./engine";
import type { ShipShape, Skin } from "./skins";
import { ARENA, H, PALETTE, PICKUP_COLORS, W, type Bullet, type Enemy, type FrameInput, type Pickup, type Player } from "./types";

const TAU = Math.PI * 2;
const PLAYER_R = 13;
const JOY_MAX = 90;
const FONT_UI = '800 11px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const FONT_SCORE = '700 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FONT_BIG = '900 64px "Arial Black", "Trebuchet MS", system-ui, sans-serif';

function hexRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string, radius: number): HTMLCanvasElement {
  const key = `${color}|${radius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = radius * 2;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grd.addColorStop(0, hexRgba(color, 1));
  grd.addColorStop(0.3, hexRgba(color, 0.45));
  grd.addColorStop(1, hexRgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, radius * 2, radius * 2);
  glowCache.set(key, c);
  return c;
}

function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, radius: number, alpha = 1) {
  const r = Math.max(4, Math.round(radius));
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color, r), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// Static layers, built once.
let bgLayer: HTMLCanvasElement | null = null;
let overlayLayer: HTMLCanvasElement | null = null;

function buildLayers() {
  if (bgLayer && overlayLayer) return;
  bgLayer = document.createElement("canvas");
  bgLayer.width = W;
  bgLayer.height = H;
  const b = bgLayer.getContext("2d")!;
  const lin = b.createLinearGradient(0, 0, 0, H);
  lin.addColorStop(0, PALETTE.bgTop);
  lin.addColorStop(1, PALETTE.bgBottom);
  b.fillStyle = lin;
  b.fillRect(0, 0, W, H);
  const r1 = b.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, 520);
  r1.addColorStop(0, hexRgba(PALETTE.cyan, 0.12));
  r1.addColorStop(1, hexRgba(PALETTE.cyan, 0));
  b.fillStyle = r1;
  b.fillRect(0, 0, W, H);
  const r2 = b.createRadialGradient(W * 0.9, H * 0.95, 0, W * 0.9, H * 0.95, 560);
  r2.addColorStop(0, hexRgba(PALETTE.magenta, 0.14));
  r2.addColorStop(1, hexRgba(PALETTE.magenta, 0));
  b.fillStyle = r2;
  b.fillRect(0, 0, W, H);

  overlayLayer = document.createElement("canvas");
  overlayLayer.width = W;
  overlayLayer.height = H;
  const o = overlayLayer.getContext("2d")!;
  const vig = o.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.66);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.65)");
  o.fillStyle = vig;
  o.fillRect(0, 0, W, H);
  o.fillStyle = "rgba(0,0,0,0.13)";
  for (let y = 0; y < H; y += 3) o.fillRect(0, y, W, 1);
}

export function renderGame(ctx: CanvasRenderingContext2D, g: Engine, input: FrameInput) {
  buildLayers();
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  ctx.drawImage(bgLayer!, 0, 0, W, H);

  ctx.save();
  const s = g.shake * g.shake;
  if (s > 0.0005) ctx.translate((Math.random() - 0.5) * s * 26, (Math.random() - 0.5) * s * 26);

  drawGrid(ctx, g.time);
  drawStars(ctx, g);
  drawArena(ctx, g);
  drawPickups(ctx, g);
  drawEnemies(ctx, g);
  drawBullets(ctx, g);
  if (g.phase !== "menu") for (const p of g.players) drawPlayer(ctx, g, p);
  drawParticles(ctx, g);
  drawPopups(ctx, g);
  ctx.restore();

  if (g.phase === "playing" || g.phase === "countdown") drawTouches(ctx, input);
  if ((g.phase === "playing" || g.phase === "countdown") && input.mouse.active && g.mode === "solo") drawCrosshair(ctx, input, g);

  if (g.damageFlash > 0) {
    ctx.fillStyle = hexRgba(PALETTE.red, g.damageFlash * 0.28);
    ctx.fillRect(0, 0, W, H);
  }

  if (g.phase === "playing" || g.phase === "countdown" || g.phase === "paused") drawHud(ctx, g);
  if (g.phase === "countdown") drawCountdown(ctx, g);
  drawBanner(ctx, g);

  ctx.drawImage(overlayLayer!, 0, 0, W, H);
  if (g.phase === "paused") {
    ctx.fillStyle = "rgba(5,2,15,0.55)";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, time: number) {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const off = (time * 16) % 48;
  for (let x = 0; x <= W; x += 48) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = -48 + off; y <= H; y += 48) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
}

function drawStars(ctx: CanvasRenderingContext2D, g: Engine) {
  for (const s of g.stars) {
    ctx.globalAlpha = 0.25 + s.z * 0.6;
    ctx.fillStyle = s.z > 0.8 ? PALETTE.cyan : PALETTE.white;
    const sz = s.z > 0.7 ? 2 : 1;
    ctx.fillRect(s.x, s.y, sz, sz);
  }
  ctx.globalAlpha = 1;
}

function drawArena(ctx: CanvasRenderingContext2D, g: Engine) {
  const { x0, y0, x1, y1 } = ARENA;
  ctx.fillStyle = "rgba(12,6,40,0.38)";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Wall flashes: gradient bands bleeding in from each wall on echo.
  const bands: [number, number, number, number, number, number][] = [
    [0, y0, 0, y0 + 60, 0, 0],
    [x1, 0, x1 - 60, 0, 1, 0],
    [0, y1, 0, y1 - 60, 2, 0],
    [x0, 0, x0 + 60, 0, 3, 0],
  ];
  ctx.globalCompositeOperation = "lighter";
  for (const [ax, ay, bx, by, wall] of bands) {
    const f = g.wallFlash[wall];
    if (f < 0.01) continue;
    const grd = ctx.createLinearGradient(ax, ay, bx || ax, by || ay);
    grd.addColorStop(0, hexRgba(PALETTE.cyan, 0.35 * f));
    grd.addColorStop(1, hexRgba(PALETTE.cyan, 0));
    ctx.fillStyle = grd;
    if (wall === 0) ctx.fillRect(x0, y0, x1 - x0, 60);
    else if (wall === 2) ctx.fillRect(x0, y1 - 60, x1 - x0, 60);
    else if (wall === 1) ctx.fillRect(x1 - 60, y0, 60, y1 - y0);
    else ctx.fillRect(x0, y0, 60, y1 - y0);
  }
  ctx.globalCompositeOperation = "source-over";

  // Walls: base glow + crisp line, thicker when flashing.
  const segs: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const [ax, ay, bx, by] = segs[i];
    const f = g.wallFlash[i];
    ctx.strokeStyle = hexRgba(PALETTE.cyan, 0.22 + f * 0.6);
    ctx.lineWidth = 6 + f * 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = f > 0.05 ? PALETTE.white : hexRgba(PALETTE.cyan, 0.9);
    ctx.lineWidth = 1.6 + f * 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  // Corner brackets for a HUD feel.
  ctx.strokeStyle = hexRgba(PALETTE.magenta, 0.9);
  ctx.lineWidth = 2.5;
  const c = 18;
  const corners: [number, number, number, number, number, number][] = [
    [x0, y0 + c, x0, y0, x0 + c, y0],
    [x1 - c, y0, x1, y0, x1, y0 + c],
    [x1, y1 - c, x1, y1, x1 - c, y1],
    [x0 + c, y1, x0, y1, x0, y1 - c],
  ];
  for (const [a, b, cc, d, e, f] of corners) {
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(cc, d);
    ctx.lineTo(e, f);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawPickups(ctx: CanvasRenderingContext2D, g: Engine) {
  for (const k of g.pickups) drawPickup(ctx, k);
}

function drawPickup(ctx: CanvasRenderingContext2D, k: Pickup) {
  if (k.life < 2 && Math.floor(k.life * 8) % 2 === 0) return;
  const col = PICKUP_COLORS[k.kind];
  const bob = Math.sin(k.t * 5) * 2;
  const y = k.y + bob;
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, col, k.x, y, 30, 0.65);
  ctx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.translate(k.x, y);
  ctx.rotate(k.t * 1.8);
  ctx.fillStyle = PALETTE.ink;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(10, 0);
  ctx.lineTo(0, 12);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = col;
  ctx.font = '900 12px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(k.kind === "rapid" ? "R" : k.kind === "spread" ? "S" : "+", k.x, y + 0.5);
  ctx.textBaseline = "alphabetic";
}

function drawEnemies(ctx: CanvasRenderingContext2D, g: Engine) {
  for (const e of g.enemies) drawEnemy(ctx, g, e);
}

function drawEnemy(ctx: CanvasRenderingContext2D, g: Engine, e: Enemy) {
  if (e.spawn > 0) {
    const k = 1 - e.spawn / 0.8;
    ctx.strokeStyle = hexRgba(e.color, 0.35 + k * 0.6);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -g.time * 40;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (2.6 - k * 1.6), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = "lighter";
    drawGlow(ctx, e.color, e.x, e.y, e.r * 1.6, 0.2 + k * 0.5);
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, e.color, e.x, e.y, e.r * 2.6, 0.6);
  ctx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.translate(e.x, e.y);
  const r = e.r;
  ctx.fillStyle = PALETTE.ink;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2.2;
  if (e.kind === "drone") {
    ctx.rotate(e.t * 2.5);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = hexRgba(e.color, 0.35 + 0.35 * Math.sin(e.t * 8));
    ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
  } else if (e.kind === "turret") {
    ctx.beginPath();
    ctx.rect(-r, -r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(e.aim);
    ctx.fillStyle = e.color;
    ctx.fillRect(0, -3.5, r + 10, 7);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, TAU);
    ctx.fill();
    if (e.fireCd > 0 && e.fireCd < 0.35) {
      const k = 1 - e.fireCd / 0.35;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(r + 10, 0, 3 + k * 6, 0, TAU);
      ctx.fillStyle = PALETTE.white;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  } else {
    ctx.rotate(e.ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r * 0.9, r * 0.9);
    ctx.lineTo(0, r * 0.4);
    ctx.lineTo(-r * 0.9, r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  if (e.flash > 0.02) {
    ctx.globalAlpha = e.flash * 0.75;
    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (e.maxHp > 1) {
    for (let i = 0; i < e.maxHp; i++) {
      ctx.fillStyle = i < e.hp ? e.color : hexRgba(e.color, 0.2);
      ctx.fillRect(e.x - (e.maxHp * 7) / 2 + i * 7, e.y - r - 12, 5, 4);
    }
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, g: Engine) {
  // Trails
  ctx.lineCap = "round";
  for (const b of g.bullets) {
    const n = b.trail.length;
    if (n < 2) continue;
    ctx.strokeStyle = hexRgba(b.color, b.owner === -1 ? 0.35 : 0.5);
    ctx.lineWidth = b.r * 1.3;
    ctx.beginPath();
    ctx.moveTo(b.trail[0].x, b.trail[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // Glows (additive)
  ctx.globalCompositeOperation = "lighter";
  for (const b of g.bullets) {
    const gr = b.owner === -1 ? b.r * 4 : b.r * 4.6 + b.bounces * 1.6;
    drawGlow(ctx, b.color, b.x, b.y, gr, b.owner === -2 ? 0.55 : 1);
  }
  ctx.globalCompositeOperation = "source-over";

  // Cores
  for (const b of g.bullets) drawBulletCore(ctx, g, b);
}

function drawBulletCore(ctx: CanvasRenderingContext2D, g: Engine, b: Bullet) {
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 0.7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 1.15, 0, TAU);
  ctx.stroke();
}

/** Outline of a ship hull in local space (nose pointing up, -y). */
function shipPath(ctx: CanvasRenderingContext2D, shape: ShipShape) {
  ctx.beginPath();
  switch (shape) {
    case "arrow":
      ctx.moveTo(0, -17);
      ctx.lineTo(12, 11);
      ctx.lineTo(0, 5);
      ctx.lineTo(-12, 11);
      break;
    case "delta":
      ctx.moveTo(0, -18);
      ctx.lineTo(15, 13);
      ctx.lineTo(0, 7);
      ctx.lineTo(-15, 13);
      break;
    case "wing":
      ctx.moveTo(0, -15);
      ctx.lineTo(9, -4);
      ctx.lineTo(20, 6);
      ctx.lineTo(11, 11);
      ctx.lineTo(0, 4);
      ctx.lineTo(-11, 11);
      ctx.lineTo(-20, 6);
      ctx.lineTo(-9, -4);
      break;
    case "orb":
      ctx.arc(0, 0, 11, 0, TAU);
      break;
    case "needle":
      ctx.moveTo(0, -21);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 11);
      ctx.lineTo(-5, 6);
      break;
    case "hex":
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const x = Math.cos(a) * 14;
        const y = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
  }
  ctx.closePath();
}

function shipNose(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-4, -9);
  ctx.lineTo(0, -19);
  ctx.lineTo(4, -9);
  ctx.closePath();
}

/** Paints a ship hull centred at the current origin, rotated by `rot` (radians). */
export function paintShipAt(ctx: CanvasRenderingContext2D, skin: Skin, x: number, y: number, rot: number, scale: number, flash: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  shipPath(ctx, skin.shape);
  ctx.fillStyle = flash > 0.05 ? hexRgba(skin.color, 0.35 + flash * 0.5) : PALETTE.ink;
  ctx.fill();
  if (skin.shape === "orb") {
    shipNose(ctx);
    ctx.fillStyle = skin.color;
    ctx.fill();
  }
  shipPath(ctx, skin.shape);
  ctx.strokeStyle = skin.color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, TAU);
  ctx.fillStyle = PALETTE.white;
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, g: Engine, p: Player) {
  if (!p.alive) {
    ctx.strokeStyle = hexRgba(p.color, 0.35);
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 4, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = FONT_UI;
    ctx.textAlign = "center";
    ctx.fillStyle = hexRgba(p.color, 0.6);
    ctx.fillText("OUT", p.x, p.y + 30);
    return;
  }
  const blink = p.invuln > 0 && Math.floor(g.time * 14) % 2 === 0;

  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, p.color, p.x, p.y, 44 + p.recoil * 6, 0.5 + p.flash * 0.3);
  ctx.globalCompositeOperation = "source-over";

  if (g.phase === "playing") {
    ctx.strokeStyle = hexRgba(p.color, 0.3);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aim) * 22, p.y + Math.sin(p.aim) * 22);
    ctx.lineTo(p.x + Math.cos(p.aim) * 90, p.y + Math.sin(p.aim) * 90);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  const kick = p.recoil * 4;
  ctx.translate(p.x - Math.cos(p.aim) * kick, p.y - Math.sin(p.aim) * kick);
  ctx.rotate(p.aim + Math.PI / 2);
  ctx.globalAlpha = blink ? 0.3 : 1;
  paintShipAt(ctx, p.skin, 0, 0, 0, 1, p.flash);
  if (p.spread > 0 || p.rapid > 0) {
    ctx.beginPath();
    ctx.arc(0, -17, 2.5, 0, TAU);
    ctx.fillStyle = p.rapid > 0 ? PICKUP_COLORS.rapid : PICKUP_COLORS.spread;
    ctx.fill();
  }
  ctx.restore();

  if (p.invuln > 0) {
    ctx.strokeStyle = hexRgba(p.color, 0.55);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -g.time * 60;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 9, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  if (g.mode === "duel") {
    ctx.font = FONT_UI;
    ctx.textAlign = "center";
    ctx.fillStyle = hexRgba(p.color, 0.9);
    ctx.fillText(p.name, p.x, p.y + 30);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, g: Engine) {
  ctx.globalCompositeOperation = "lighter";
  for (const q of g.particles) {
    const a = Math.max(0, q.life / q.max);
    ctx.globalAlpha = a;
    if (q.spark) {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = q.size;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
      ctx.stroke();
    } else {
      ctx.fillStyle = q.color;
      const s = q.size * (0.5 + a * 0.5);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawRings(ctx: CanvasRenderingContext2D, g: Engine) {
  ctx.globalCompositeOperation = "lighter";
  for (const r of g.rings) {
    const a = Math.max(0, r.life / r.max);
    ctx.globalAlpha = a;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * a + 0.6;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawPopups(ctx: CanvasRenderingContext2D, g: Engine) {
  ctx.textAlign = "center";
  for (const pu of g.popups) {
    const a = Math.min(1, (pu.life / pu.max) * 1.8);
    ctx.globalAlpha = a;
    ctx.font = `900 ${pu.size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = PALETTE.ink;
    ctx.strokeText(pu.text, pu.x, pu.y);
    ctx.fillStyle = pu.color;
    ctx.fillText(pu.text, pu.x, pu.y);
  }
  ctx.globalAlpha = 1;
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function drawBanner(ctx: CanvasRenderingContext2D, g: Engine) {
  const b = g.banner;
  if (!b) return;
  const t = 1 - b.life / b.max;
  const pop = 0.6 + 0.4 * easeOutBack(Math.min(1, t / 0.2));
  const alpha = Math.min(1, b.life / 0.35);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, H * 0.4);
  ctx.scale(pop, pop);
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, b.color, 0, 0, 220, 0.2);
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  ctx.font = FONT_BIG;
  ctx.lineWidth = 8;
  ctx.strokeStyle = PALETTE.ink;
  ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = b.color;
  ctx.fillText(b.text, 0, 0);
  if (b.sub) {
    ctx.font = '700 17px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(b.sub, 0, 40);
    ctx.fillStyle = PALETTE.white;
    ctx.fillText(b.sub, 0, 40);
  }
  ctx.restore();
}

function drawCountdown(ctx: CanvasRenderingContext2D, g: Engine) {
  const x = g.countdown * 1.5;
  const n = Math.ceil(x);
  const f = x - Math.floor(x);
  if (n <= 0) return;
  ctx.save();
  ctx.translate(W / 2, H / 2 + 20);
  const sc = 1.7 - f * 0.9;
  ctx.scale(sc, sc);
  ctx.globalAlpha = Math.min(1, 0.25 + (1 - f) * 1.5);
  ctx.textAlign = "center";
  ctx.font = '900 96px "Arial Black", "Trebuchet MS", system-ui, sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = PALETTE.ink;
  ctx.strokeText(String(n), 0, 0);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
}

function fmtScore(n: number) {
  return n.toLocaleString("en-US");
}

function fmtTime(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function drawHud(ctx: CanvasRenderingContext2D, g: Engine) {
  const grd = ctx.createLinearGradient(0, 0, 0, 62);
  grd.addColorStop(0, "rgba(5,2,15,0.9)");
  grd.addColorStop(1, "rgba(5,2,15,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, 62);

  const p0 = g.players[0];
  if (p0) drawPlayerHud(ctx, g, p0, 22, "left");
  if (g.mode === "duel" && g.players[1]) drawPlayerHud(ctx, g, g.players[1], W - 22, "right");

  ctx.textAlign = "center";
  ctx.font = '800 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(`WAVE ${Math.max(1, g.wave)}`, W / 2, 16);
  ctx.font = FONT_SCORE;
  ctx.fillStyle = PALETTE.white;
  ctx.fillText(fmtTime(g.t), W / 2, 42);
  const prog = (g.t % 20) / 20;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(W / 2 - 46, 50, 92, 3);
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(W / 2 - 46, 50, 92 * prog, 3);

  if (g.mode === "solo") {
    ctx.textAlign = "right";
    ctx.font = FONT_UI;
    ctx.fillStyle = "rgba(248,251,255,0.55)";
    ctx.fillText("BEST", W - 22, 16);
    ctx.font = FONT_SCORE;
    ctx.fillStyle = PALETTE.white;
    ctx.fillText(fmtScore(Math.max(g.bestLocal, p0?.score ?? 0)), W - 22, 42);
  }
}

function drawPlayerHud(ctx: CanvasRenderingContext2D, g: Engine, p: Player, x: number, align: "left" | "right") {
  ctx.textAlign = align;
  ctx.font = FONT_UI;
  ctx.fillStyle = p.color;
  ctx.fillText(g.mode === "duel" ? p.name : "PILOT", x, 16);

  // Lives as diamonds next to the label.
  const labelW = ctx.measureText(g.mode === "duel" ? p.name : "PILOT").width;
  const dir = align === "left" ? 1 : -1;
  const lx0 = x + dir * (labelW + 14);
  for (let i = 0; i < Math.max(p.maxLives, p.lives); i++) {
    const cx = lx0 + dir * i * 13;
    const on = i < p.lives;
    ctx.beginPath();
    ctx.moveTo(cx, 9);
    ctx.lineTo(cx + 4.5, 13);
    ctx.lineTo(cx, 17);
    ctx.lineTo(cx - 4.5, 13);
    ctx.closePath();
    ctx.fillStyle = on ? PALETTE.red : "rgba(255,84,112,0.18)";
    ctx.fill();
  }

  ctx.font = FONT_SCORE;
  ctx.fillStyle = PALETTE.white;
  ctx.fillText(fmtScore(p.score), x, 44);
  const sw = ctx.measureText(fmtScore(p.score)).width;

  // Multiplier and combo timer bar.
  const bx = align === "left" ? x + sw + 12 : x - sw - 12;
  ctx.font = '900 16px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillStyle = p.mult > 1 ? PALETTE.gold : "rgba(248,251,255,0.5)";
  ctx.textAlign = align;
  ctx.fillText(`x${p.mult}`, bx, 44);
  const barX = align === "left" ? x : x - 110;
  const barY = 51;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(barX, barY, 110, 4);
  const frac = p.combo > 0 ? Math.max(0, Math.min(1, p.comboT / 2.4)) : 0;
  ctx.fillStyle = p.mult > 1 ? PALETTE.gold : p.color;
  ctx.fillRect(barX, barY, 110 * frac, 4);

  // Power-up badges inside the arena.
  let by = 84;
  const bxBase = align === "left" ? 34 : W - 34;
  const badge = (label: string, t: number, col: string) => {
    const bw = 96;
    const bxL = align === "left" ? bxBase : bxBase - bw;
    ctx.fillStyle = "rgba(5,2,15,0.7)";
    ctx.fillRect(bxL, by, bw, 18);
    ctx.fillStyle = col;
    ctx.fillRect(bxL, by, bw * Math.min(1, t / 7), 2);
    ctx.textAlign = "left";
    ctx.font = FONT_UI;
    ctx.fillStyle = col;
    ctx.fillText(`${label} ${t.toFixed(1)}s`, bxL + 6, by + 13);
    by += 22;
  };
  if (p.rapid > 0) badge("RAPID", p.rapid, PICKUP_COLORS.rapid);
  if (p.spread > 0) badge("TRIPLE", p.spread, PICKUP_COLORS.spread);
  ctx.textAlign = align;
}

function drawTouches(ctx: CanvasRenderingContext2D, input: FrameInput) {
  for (const t of input.touches) {
    const col = t.p === 0 ? "#5ef2ff" : "#a78bfa";
    ctx.strokeStyle = hexRgba(col, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.ox, t.oy, JOY_MAX, 0, TAU);
    ctx.stroke();
    let dx = t.x - t.ox;
    let dy = t.y - t.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_MAX) {
      dx = (dx / len) * JOY_MAX;
      dy = (dy / len) * JOY_MAX;
    }
    ctx.fillStyle = hexRgba(col, 0.25);
    ctx.beginPath();
    ctx.arc(t.ox + dx, t.oy + dy, 26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexRgba(col, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, input: FrameInput, g: Engine) {
  if (g.players[0]?.alive === false) return;
  const { x, y } = input.mouse;
  ctx.strokeStyle = hexRgba(PALETTE.cyan, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
}
