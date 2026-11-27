// Bullet Echo simulation: all game state and rules. Rendering lives in render.ts.
import { sfx } from "./audio";
import { DUELIST, SKINS, type Skin } from "./skins";
import {
  ARENA,
  ENEMY_COLORS,
  KILL_POINTS,
  P_COLORS,
  PALETTE,
  PICKUP_COLORS,
  W,
  H,
  type Banner,
  type Bullet,
  type Enemy,
  type EnemyKind,
  type FrameInput,
  type HudSnapshot,
  type Mode,
  type Particle,
  type Phase,
  type Pickup,
  type PickupKind,
  type Player,
  type Popup,
  type Ring,
  type RunSummary,
} from "./types";

const TAU = Math.PI * 2;
const PLAYER_R = 13;
const PLAYER_SPEED = 310;
const ACCEL = 22;
const BULLET_SPEED = 820;
const MAX_LIVES = 3;
const MAX_HEARTS = 5;
const MAX_PARTICLES = 700;
const WAVE_LEN = 20;
const SPAWN_CLEARANCE = 150;
const WAVE_SUBS = [
  "",
  "Bounce shots off walls to ECHO",
  "Turrets are online",
  "Hunters are tracking you",
  "Stay on the move",
];

export interface RunConfig {
  mode: Mode;
  skin: Skin;
  heart: boolean;
  rapid: boolean;
}

const DEFAULT_CFG: RunConfig = { mode: "solo", skin: SKINS[0], heart: false, rapid: false };

let uid = 1;

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * k;
}

function nearestAlive(players: Player[], x: number, y: number): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of players) {
    if (!p.alive) continue;
    const d = dist2(p, { x, y });
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export class Engine {
  phase: Phase = "menu";
  mode: Mode = "solo";
  /** Elapsed play time (excludes countdown/pause). */
  t = 0;
  /** Global clock for ambient animation (always running). */
  time = 0;
  countdown = 0;
  wave = 0;
  players: Player[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  popups: Popup[] = [];
  banner: Banner | null = null;
  stars: { x: number; y: number; z: number }[] = [];
  shake = 0;
  hitstop = 0;
  damageFlash = 0;
  wallFlash = [0, 0, 0, 0];
  overT = 0;
  overReady = false;
  summary: RunSummary | null = null;
  bestLocal = 0;
  onPhase: ((phase: Phase, summary: RunSummary | null) => void) | null = null;

  private spawnCd = 0;
  private attractCd = 0;
  private pausedFrom: Phase = "playing";
  private checkOver = false;

  cfg: RunConfig = DEFAULT_CFG;

  constructor() {
    for (let i = 0; i < 110; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.15 + Math.random() * 0.85 });
    }
    this.resetWorld(DEFAULT_CFG);
    this.phase = "menu";
  }

  // ---------- lifecycle ----------

  private makePlayer(id: number, mode: Mode, skin: Skin): Player {
    const duel = mode === "duel";
    return {
      id,
      name: duel ? `P${id + 1}` : "PILOT",
      skin,
      echoKills: 0,
      grazes: 0,
      color: skin.color,
      x: duel ? (id === 0 ? W * 0.3 : W * 0.7) : W / 2,
      y: ARENA.y1 - 90,
      vx: 0,
      vy: 0,
      aim: -Math.PI / 2,
      alive: true,
      lives: MAX_LIVES,
      maxLives: MAX_LIVES,
      score: 0,
      kills: 0,
      bestCombo: 0,
      combo: 0,
      comboT: 0,
      mult: 1,
      fireCd: 0,
      invuln: 0,
      rapid: 0,
      spread: 0,
      flash: 0,
      recoil: 0,
    };
  }

  private resetWorld(cfg: RunConfig) {
    this.cfg = cfg;
    const mode = cfg.mode;
    this.mode = mode;
    this.players =
      mode === "duel"
        ? [this.makePlayer(0, "duel", cfg.skin), this.makePlayer(1, "duel", DUELIST)]
        : [this.makePlayer(0, "solo", cfg.skin)];
    if (cfg.heart) this.players[0].lives = Math.min(MAX_HEARTS, this.players[0].lives + 1);
    if (cfg.rapid) this.players[0].rapid = 10;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.banner = null;
    this.t = 0;
    this.wave = 0;
    this.spawnCd = 0.6;
    this.shake = 0;
    this.hitstop = 0;
    this.damageFlash = 0;
    this.wallFlash = [0, 0, 0, 0];
    this.overT = 0;
    this.overReady = false;
    this.summary = null;
    this.checkOver = false;
  }

  private setPhase(phase: Phase, summary: RunSummary | null = null) {
    this.phase = phase;
    this.onPhase?.(phase, summary);
  }

  start(cfg: RunConfig) {
    this.resetWorld(cfg);
    this.countdown = 2.0;
    this.setPhase("countdown");
  }

  toMenu() {
    this.resetWorld({ ...this.cfg, mode: "solo" });
    this.setPhase("menu");
  }

  togglePause() {
    if (this.phase === "playing" || this.phase === "countdown") {
      this.pausedFrom = this.phase;
      this.setPhase("paused");
      sfx.play("pause");
    } else if (this.phase === "paused") {
      this.setPhase(this.pausedFrom);
      sfx.play("ui");
    }
  }

  restart() {
    if (this.phase === "menu") return;
    if (this.phase === "over" && !this.overReady) return;
    this.start(this.cfg);
  }

  private goLive() {
    this.phase = "playing";
    sfx.play("start");
    this.banner = {
      text: "GO!",
      color: PALETTE.cyan,
      sub: this.mode === "duel" ? "Shoot the other pilot too" : "Shoot everything. Echo for bonus.",
      life: 1.5,
      max: 1.5,
    };
    this.spawnEnemy("drone");
    this.spawnEnemy("drone");
    this.setPhase("playing");
  }

  private finish() {
    this.phase = "over";
    this.overT = 0;
    this.overReady = false;
    const winner = this.mode === "duel" && this.players[1].score > this.players[0].score ? 1 : 0;
    const w = this.players[winner];
    this.summary = {
      mode: this.mode,
      score: w.score,
      wave: this.wave,
      time: this.t,
      winner,
      players: this.players.map((p) => ({
        name: p.name,
        color: p.color,
        score: p.score,
        kills: p.kills,
        echoKills: p.echoKills,
        grazes: p.grazes,
        bestCombo: p.bestCombo,
        alive: p.alive,
      })),
    };
    this.shake = 1;
    this.hitstop = 0.12;
    for (const p of this.players) this.explode(p.x, p.y, p.color, 40, 380);
    sfx.play("over");
    this.setPhase("over", this.summary);
  }

  getHud(): HudSnapshot {
    return {
      phase: this.phase,
      mode: this.mode,
      time: this.t,
      wave: this.wave,
      overReady: this.overReady,
      bestLocal: this.bestLocal,
      players: this.players.map((p) => ({
        name: p.name,
        color: p.color,
        score: p.score,
        lives: p.lives,
        maxLives: p.maxLives,
        mult: p.mult,
        combo: p.combo,
        comboT: p.comboT,
        alive: p.alive,
        rapid: p.rapid,
        spread: p.spread,
        kills: p.kills,
        bestCombo: p.bestCombo,
      })),
    };
  }

  // ---------- main update ----------

  update(dt: number, input: FrameInput) {
    this.time += dt;
    switch (this.phase) {
      case "menu":
        this.attract(dt);
        this.updateStars(dt);
        this.updateBullets(dt);
        this.updateFx(dt);
        return;
      case "paused":
        return;
      case "over":
        this.overT += dt;
        if (this.overT > 0.7) this.overReady = true;
        this.updateStars(dt);
        this.updateFx(dt);
        return;
      case "countdown":
        this.updateStars(dt);
        this.updatePlayers(dt, input, false);
        this.updateFx(dt);
        this.countdown -= dt;
        if (this.countdown <= 0) this.goLive();
        return;
      case "playing":
        this.step(dt, input);
        return;
    }
  }

  private step(dt: number, input: FrameInput) {
    this.updateStars(dt);
    if (this.hitstop > 0) {
      // Hit-stop: freeze the simulation briefly for impact, keep FX animating.
      this.hitstop -= dt;
      this.updateFx(dt);
      return;
    }
    this.t += dt;
    const w = Math.floor(this.t / WAVE_LEN) + 1;
    if (w !== this.wave) {
      this.wave = w;
      this.onWave();
    }
    this.spawnDirector(dt);
    this.updatePlayers(dt, input, true);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.collide();
    this.updatePickups(dt);
    this.updateFx(dt);
    if (this.checkOver) {
      this.checkOver = false;
      if (this.players.every((p) => !p.alive)) this.finish();
    }
  }

  private onWave() {
    this.spawnCd = 0.4;
    if (this.wave > 1) {
      sfx.play("wave");
      this.banner = {
        text: `WAVE ${this.wave}`,
        color: PALETTE.gold,
        sub: WAVE_SUBS[Math.min(WAVE_SUBS.length - 1, this.wave - 1)],
        life: 2.2,
        max: 2.2,
      };
      this.shake = Math.max(this.shake, 0.35);
      const extra = Math.min(3, 1 + Math.floor(this.wave / 2));
      for (let i = 0; i < extra; i++) this.spawnEnemy(this.pickKind());
    }
  }

  private pickKind(): EnemyKind {
    const pool: [EnemyKind, number][] = [["drone", 1]];
    if (this.t > 10) pool.push(["turret", 0.45]);
    if (this.t > 22) pool.push(["hunter", 0.5]);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) return k;
    }
    return "drone";
  }

  private spawnDirector(dt: number) {
    this.spawnCd -= dt;
    if (this.spawnCd > 0) return;
    const cap = Math.min(20, 5 + this.wave * 2);
    if (this.enemies.length < cap) this.spawnEnemy(this.pickKind());
    this.spawnCd = Math.max(0.45, 1.4 - this.wave * 0.12) * rnd(0.75, 1.25);
  }

  private findSpawnPos() {
    let best = { x: rnd(ARENA.x0 + 60, ARENA.x1 - 60), y: rnd(ARENA.y0 + 60, ARENA.y1 - 60) };
    for (let i = 0; i < 14; i++) {
      const c = { x: rnd(ARENA.x0 + 60, ARENA.x1 - 60), y: rnd(ARENA.y0 + 60, ARENA.y1 - 60) };
      let ok = true;
      for (const p of this.players) {
        if (p.alive && dist2(p, c) < SPAWN_CLEARANCE * SPAWN_CLEARANCE) {
          ok = false;
          break;
        }
      }
      if (ok) return c;
      best = c;
    }
    return best;
  }

  private spawnEnemy(kind: EnemyKind) {
    const pos = this.findSpawnPos();
    const hp = kind === "turret" ? 3 : kind === "hunter" ? 2 : 1;
    const r = kind === "turret" ? 17 : kind === "hunter" ? 15 : 12;
    const speed =
      kind === "drone" ? 100 + Math.min(80, this.wave * 8) : kind === "hunter" ? 92 + Math.min(40, this.wave * 4) : 0;
    this.enemies.push({
      id: uid++,
      kind,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      ang: rnd(0, TAU),
      speed,
      r,
      hp,
      maxHp: hp,
      t: 0,
      seed: rnd(0, 100),
      aim: rnd(0, TAU),
      fireCd: kind === "turret" ? rnd(0.9, 1.5) : kind === "hunter" ? rnd(1.6, 2.6) : 99,
      spawn: 0.8,
      flash: 0,
      color: ENEMY_COLORS[kind],
      dead: false,
    });
  }

  private makeBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: number,
    maxBounces: number,
    r: number,
    color: string,
    life: number,
  ): Bullet {
    return { x, y, vx, vy, r, owner, bounces: 0, maxBounces, life, color, trail: [], grazed: false, dead: false };
  }

  private findTarget(p: Player, input: FrameInput): { x: number; y: number } | null {
    if (p.id === 0 && input.mouse.active) {
      const dx = input.mouse.x - p.x;
      const dy = input.mouse.y - p.y;
      if (dx * dx + dy * dy > 30 * 30) return { x: input.mouse.x, y: input.mouse.y };
    }
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.spawn > 0) continue;
      const d = dist2(p, e);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return best;
    for (const q of this.players) {
      if (q !== p && q.alive) return q;
    }
    return null;
  }

  private updatePlayers(dt: number, input: FrameInput, canFire: boolean) {
    for (const p of this.players) {
      const ip = input.p[p.id] ?? input.p[0];
      p.flash = Math.max(0, p.flash - dt * 5);
      p.recoil = Math.max(0, p.recoil - dt * 9);
      if (!p.alive) {
        p.vx *= Math.exp(-6 * dt);
        p.vy *= Math.exp(-6 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        continue;
      }

      // Movement: snappy acceleration toward stick direction.
      let mx = ip.mx;
      let my = ip.my;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      const k = 1 - Math.exp(-ACCEL * dt);
      p.vx += (mx * PLAYER_SPEED - p.vx) * k;
      p.vy += (my * PLAYER_SPEED - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = clamp(p.x, ARENA.x0 + PLAYER_R, ARENA.x1 - PLAYER_R);
      p.y = clamp(p.y, ARENA.y0 + PLAYER_R, ARENA.y1 - PLAYER_R);

      // Timers.
      p.fireCd -= dt;
      p.invuln -= dt;
      p.rapid -= dt;
      p.spread -= dt;
      if (p.comboT > 0) {
        p.comboT -= dt;
        if (p.comboT <= 0) {
          p.combo = 0;
          p.mult = 1;
        }
      }

      // Thruster trail.
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 60 && Math.random() < dt * 50) {
        this.addP(
          p.x - p.vx * 0.04 + rnd(-3, 3),
          p.y - p.vy * 0.04 + rnd(-3, 3),
          -p.vx * 0.15 + rnd(-20, 20),
          -p.vy * 0.15 + rnd(-20, 20),
          0.3,
          2.4,
          p.color,
          4,
          false,
        );
      }

      // Aim: mouse (P1 only) or nearest target, smoothed.
      const target = this.findTarget(p, input);
      if (target) {
        p.aim = lerpAngle(p.aim, Math.atan2(target.y - p.y, target.x - p.x), 1 - Math.exp(-24 * dt));
      }

      if (canFire && ip.fire && p.fireCd <= 0) this.firePlayer(p);
    }
  }

  private firePlayer(p: Player) {
    p.fireCd = p.rapid > 0 ? 0.072 : 0.13;
    p.recoil = 1;
    const offs = p.spread > 0 ? [-0.2, 0, 0.2] : [0];
    const nx = p.x + Math.cos(p.aim) * 16;
    const ny = p.y + Math.sin(p.aim) * 16;
    for (const o of offs) {
      const a = p.aim + o;
      this.bullets.push(
        this.makeBullet(nx, ny, Math.cos(a) * BULLET_SPEED, Math.sin(a) * BULLET_SPEED, p.id, 2, 4, p.color, 2.6),
      );
    }
    for (let i = 0; i < 3; i++) {
      const a = p.aim + rnd(-0.5, 0.5);
      this.addP(nx, ny, Math.cos(a) * 260, Math.sin(a) * 260, 0.18, 2, PALETTE.white, 8, true);
    }
    sfx.play("shoot");
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.spawn > 0) {
        e.spawn -= dt;
        continue;
      }
      const tgt = nearestAlive(this.players, e.x, e.y);

      if (e.kind === "drone") {
        e.ang += Math.sin(e.t * 2.2 + e.seed) * dt * 2.4;
        let x = e.x + Math.cos(e.ang) * e.speed * dt;
        let y = e.y + Math.sin(e.ang) * e.speed * dt;
        if (x < ARENA.x0 + e.r) {
          x = ARENA.x0 + e.r;
          e.ang = Math.PI - e.ang;
        } else if (x > ARENA.x1 - e.r) {
          x = ARENA.x1 - e.r;
          e.ang = Math.PI - e.ang;
        }
        if (y < ARENA.y0 + e.r) {
          y = ARENA.y0 + e.r;
          e.ang = -e.ang;
        } else if (y > ARENA.y1 - e.r) {
          y = ARENA.y1 - e.r;
          e.ang = -e.ang;
        }
        e.x = x;
        e.y = y;
      } else if (e.kind === "turret") {
        e.x = clamp(e.x + Math.sin(e.t * 0.8 + e.seed) * 14 * dt, ARENA.x0 + 40, ARENA.x1 - 40);
        e.y = clamp(e.y + Math.cos(e.t * 0.6 + e.seed) * 10 * dt, ARENA.y0 + 40, ARENA.y1 - 40);
        if (tgt) e.aim = lerpAngle(e.aim, Math.atan2(tgt.y - e.y, tgt.x - e.x), 1 - Math.exp(-5 * dt));
        e.fireCd -= dt;
        if (e.fireCd <= 0 && tgt) {
          for (const o of [-0.16, 0, 0.16]) {
            const a = e.aim + o;
            this.bullets.push(
              this.makeBullet(e.x, e.y, Math.cos(a) * 230, Math.sin(a) * 230, -1, 0, 5, e.color, 6),
            );
          }
          e.fireCd = Math.max(1.0, 2.0 - this.wave * 0.06) * rnd(0.9, 1.1);
        }
      } else {
        // hunter: steer toward nearest pilot
        if (tgt) {
          const dx = tgt.x - e.x;
          const dy = tgt.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const k = 1 - Math.exp(-2.2 * dt);
          e.vx += ((dx / d) * e.speed - e.vx) * k;
          e.vy += ((dy / d) * e.speed - e.vy) * k;
        }
        e.x = clamp(e.x + e.vx * dt, ARENA.x0 + e.r, ARENA.x1 - e.r);
        e.y = clamp(e.y + e.vy * dt, ARENA.y0 + e.r, ARENA.y1 - e.r);
        e.ang = Math.atan2(e.vy, e.vx);
        e.fireCd -= dt;
        if (e.fireCd <= 0 && tgt) {
          const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
          this.bullets.push(this.makeBullet(e.x, e.y, Math.cos(a) * 290, Math.sin(a) * 290, -1, 0, 5, e.color, 6));
          e.fireCd = Math.max(1.4, 2.6 - this.wave * 0.08) * rnd(0.9, 1.1);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 6) b.trail.shift();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      if (b.owner === -1) {
        // Enemy bullets don't echo: remove when off-screen.
        if (b.x < ARENA.x0 - 40 || b.x > ARENA.x1 + 40 || b.y < ARENA.y0 - 40 || b.y > ARENA.y1 + 40) b.dead = true;
        continue;
      }
      // Echo walls.
      if (b.x < ARENA.x0 + b.r) {
        b.x = ARENA.x0 + b.r;
        this.wallHit(b, 3);
      } else if (b.x > ARENA.x1 - b.r) {
        b.x = ARENA.x1 - b.r;
        this.wallHit(b, 1);
      }
      if (b.dead) continue;
      if (b.y < ARENA.y0 + b.r) {
        b.y = ARENA.y0 + b.r;
        this.wallHit(b, 0);
      } else if (b.y > ARENA.y1 - b.r) {
        b.y = ARENA.y1 - b.r;
        this.wallHit(b, 2);
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private wallHit(b: Bullet, wall: number) {
    this.wallFlash[wall] = 1;
    if (b.bounces >= b.maxBounces) {
      b.dead = true;
      this.sparks(b.x, b.y, b.color, 10, 260);
      return;
    }
    b.bounces++;
    if (wall === 1 || wall === 3) b.vx = -b.vx;
    else b.vy = -b.vy;
    this.sparks(b.x, b.y, b.color, 9, 240);
    if (this.phase === "playing") sfx.play("bounce");
  }

  private collide() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.owner >= 0) {
        let hit = false;
        for (const e of this.enemies) {
          if (e.dead || e.spawn > 0) continue;
          const rr = e.r + b.r;
          if (dist2(b, e) < rr * rr) {
            this.hitEnemy(e, b);
            b.dead = true;
            hit = true;
            break;
          }
        }
        if (hit) continue;
        if (this.mode === "duel") {
          for (const p of this.players) {
            if (p.id === b.owner || !p.alive || p.invuln > 0) continue;
            const rr = PLAYER_R + b.r;
            if (dist2(b, p) < rr * rr) {
              b.dead = true;
              this.playerHitByPlayer(p, b.owner);
              break;
            }
          }
        }
      } else if (b.owner === -1) {
        for (const p of this.players) {
          if (!p.alive || p.invuln > 0) continue;
          const hitR = PLAYER_R + b.r;
          const d2 = dist2(b, p);
          if (d2 < hitR * hitR) {
            b.dead = true;
            this.hurt(p);
            break;
          }
          if (!b.grazed && d2 < (hitR + 14) * (hitR + 14)) {
            b.grazed = true;
            this.graze(p, b);
          }
        }
      }
    }

    for (const e of this.enemies) {
      if (e.dead || e.spawn > 0) continue;
      for (const p of this.players) {
        if (!p.alive || p.invuln > 0) continue;
        const rr = e.r + PLAYER_R;
        if (dist2(e, p) < rr * rr) {
          e.dead = true;
          this.explode(e.x, e.y, e.color, 24, 280);
          this.hurt(p);
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private hitEnemy(e: Enemy, b: Bullet) {
    e.hp -= 1;
    e.flash = 1;
    this.sparks(b.x, b.y, e.color, 8, 220);
    if (e.hp > 0) {
      sfx.play("hit");
      this.shake = Math.max(this.shake, 0.08);
      return;
    }
    e.dead = true;
    this.killEnemy(e, b.owner, b.bounces > 0);
  }

  private killEnemy(e: Enemy, pid: number, echo: boolean) {
    const p = this.players[pid];
    if (!p) return;
    p.kills++;
    if (echo) p.echoKills++;
    p.combo++;
    p.comboT = 2.4;
    p.mult = Math.min(8, 1 + Math.floor(p.combo / 4));
    p.bestCombo = Math.max(p.bestCombo, p.combo);
    const pts = Math.round(KILL_POINTS[e.kind] * p.mult * (echo ? 1.5 : 1));
    p.score += pts;

    const big = e.kind === "turret";
    this.popup(e.x, e.y - 10, `+${pts}`, p.color, big ? 26 : 20);
    if (echo) {
      this.popup(e.x, e.y - 40, "ECHO!", PALETTE.cyan, 18);
      sfx.play("echo");
    }
    this.explode(e.x, e.y, e.color, big ? 46 : 26, big ? 420 : 300);
    this.explode(e.x, e.y, PALETTE.white, 8, 170);
    this.shake = Math.max(this.shake, big ? 0.6 : 0.28);
    if (big) this.hitstop = Math.max(this.hitstop, 0.07);
    else if (e.kind === "hunter") this.hitstop = Math.max(this.hitstop, 0.04);
    sfx.play(big ? "bigkill" : "kill");
    if (p.combo > 0 && p.combo % 5 === 0) {
      this.popup(p.x, p.y - 36, `COMBO x${p.combo}`, PALETTE.gold, 22);
      sfx.play("combo");
    }
    if (Math.random() < 0.14) this.spawnPickup(e.x, e.y);
  }

  private playerHitByPlayer(victim: Player, shooterId: number) {
    const shooter = this.players[shooterId];
    if (shooter) {
      shooter.score += 300;
      this.popup(victim.x, victim.y - 36, "HIT! +300", shooter.color, 22);
    }
    this.hurt(victim);
  }

  private hurt(p: Player) {
    if (!p.alive || p.invuln > 0) return;
    p.lives--;
    p.invuln = 1.5;
    p.combo = 0;
    p.comboT = 0;
    p.mult = 1;
    p.flash = 1;
    this.shake = Math.max(this.shake, 0.9);
    this.damageFlash = 1;
    this.hitstop = Math.max(this.hitstop, 0.08);
    this.explode(p.x, p.y, p.color, 36, 340);
    this.explode(p.x, p.y, PALETTE.red, 14, 240);
    this.popup(p.x, p.y - 30, "-1 LIFE", PALETTE.red, 20);
    sfx.play("hurt");
    if (p.lives <= 0) {
      p.lives = 0;
      p.alive = false;
      p.vx = 0;
      p.vy = 0;
      this.popup(p.x, p.y - 58, "OUT", PALETTE.red, 30);
      this.explode(p.x, p.y, p.color, 60, 420);
      this.checkOver = true;
      const other = this.players.find((q) => q !== p && q.alive);
      if (other) {
        this.banner = { text: `${p.name} OUT`, color: p.color, sub: `${other.name} fights on!`, life: 2, max: 2 };
      }
    }
  }

  private graze(p: Player, b: Bullet) {
    p.score += 15;
    p.grazes++;
    this.sparks(b.x, b.y, PALETTE.cyan, 4, 150);
    this.popup(p.x + rnd(-10, 10), p.y - 22, "GRAZE +15", PALETTE.cyan, 12);
    sfx.play("graze");
  }

  private spawnPickup(x: number, y: number) {
    const r = Math.random();
    const kind: PickupKind = r < 0.4 ? "rapid" : r < 0.75 ? "spread" : "heart";
    const a = rnd(0, TAU);
    const s = rnd(60, 140);
    this.pickups.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind, life: 9, t: 0, dead: false });
  }

  private updatePickups(dt: number) {
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      k.life -= dt;
      if (k.life <= 0) {
        k.dead = true;
        continue;
      }
      k.vx *= Math.exp(-3 * dt);
      k.vy *= Math.exp(-3 * dt);
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (k.x < ARENA.x0 + 12 || k.x > ARENA.x1 - 12) k.vx = -k.vx;
      if (k.y < ARENA.y0 + 12 || k.y > ARENA.y1 - 12) k.vy = -k.vy;
      k.x = clamp(k.x, ARENA.x0 + 12, ARENA.x1 - 12);
      k.y = clamp(k.y, ARENA.y0 + 12, ARENA.y1 - 12);

      let near: Player | null = null;
      let bd = 120 * 120;
      for (const p of this.players) {
        if (!p.alive) continue;
        const d2 = dist2(k, p);
        if (d2 < bd) {
          bd = d2;
          near = p;
        }
      }
      if (near) {
        const d = Math.sqrt(bd) || 1;
        const sp = 260 + (120 - d) * 5;
        k.x += ((near.x - k.x) / d) * sp * dt;
        k.y += ((near.y - k.y) / d) * sp * dt;
        if (d < 24) {
          this.collect(k, near);
          k.dead = true;
        }
      }
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  private collect(k: Pickup, p: Player) {
    if (k.kind === "rapid") {
      p.rapid = 7;
      this.popup(p.x, p.y - 30, "RAPID FIRE", PICKUP_COLORS.rapid, 18);
    } else if (k.kind === "spread") {
      p.spread = 9;
      this.popup(p.x, p.y - 30, "TRIPLE SHOT", PICKUP_COLORS.spread, 18);
    } else if (p.lives < MAX_HEARTS) {
      p.lives++;
      this.popup(p.x, p.y - 30, "+1 LIFE", PICKUP_COLORS.heart, 18);
    } else {
      this.popup(p.x, p.y - 30, "MAX LIFE", PICKUP_COLORS.heart, 16);
    }
    this.explode(k.x, k.y, PICKUP_COLORS[k.kind], 18, 230);
    this.shake = Math.max(this.shake, 0.12);
    sfx.play("pickup");
  }

  // ---------- FX ----------

  private addP(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    drag: number,
    spark: boolean,
  ) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life, max: life, size, color, drag, spark });
  }

  explode(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.9);
      this.addP(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        0.35 + Math.random() * 0.45,
        1.8 + Math.random() * 2.6,
        color,
        3.2,
        Math.random() < 0.6,
      );
    }
  }

  sparks(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.addP(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + Math.random() * 0.2, 1.5, color, 6, true);
    }
  }

  popup(x: number, y: number, text: string, color: string, size: number) {
    this.popups.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
    if (this.popups.length > 40) this.popups.splice(0, this.popups.length - 40);
  }

  private updateFx(dt: number) {
    let j = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      const f = Math.exp(-q.drag * dt);
      q.vx *= f;
      q.vy *= f;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      this.particles[j++] = q;
    }
    this.particles.length = j;

    j = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) continue;
      r.r += (r.maxR - r.r) * (1 - Math.exp(-9 * dt));
      this.rings[j++] = r;
    }
    this.rings.length = j;

    j = 0;
    for (let i = 0; i < this.popups.length; i++) {
      const pu = this.popups[i];
      pu.life -= dt;
      if (pu.life <= 0) continue;
      pu.y -= 36 * dt;
      this.popups[j++] = pu;
    }
    this.popups.length = j;

    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    for (let i = 0; i < 4; i++) this.wallFlash[i] = Math.max(0, this.wallFlash[i] - dt * 4);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  private updateStars(dt: number) {
    const speed = this.phase === "playing" ? 40 + Math.min(40, this.wave * 6) : 30;
    for (const s of this.stars) {
      s.y += s.z * speed * dt;
      if (s.y > H) {
        s.y -= H;
        s.x = Math.random() * W;
      }
    }
  }

  // ---------- attract mode (menu background) ----------

  private attract(dt: number) {
    this.attractCd -= dt;
    if (this.attractCd <= 0) {
      this.attractCd = 0.45;
      const x = rnd(ARENA.x0 + 80, ARENA.x1 - 80);
      const y = ARENA.y1 - 20;
      const a = -Math.PI / 2 + rnd(-0.55, 0.55);
      const cols = [PALETTE.cyan, PALETTE.violet, PALETTE.gold];
      const col = cols[Math.floor(Math.random() * cols.length)];
      this.bullets.push(
        this.makeBullet(x, y, Math.cos(a) * 640, Math.sin(a) * 640, -2, 5, 3.5, col, 10),
      );
    }
  }

  // ---------- render helpers (read-only) ----------

  get isBusy() {
    return this.bullets.length + this.enemies.length + this.particles.length;
  }
}

export { TAU };
export type { Mode, Phase };
