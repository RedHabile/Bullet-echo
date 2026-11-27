// ── THE HOLLOW · moteur de simulation (hôte autoritaire + prédiction invité) ─
import { buildMap, type GameMap } from "./map";
import { HorrorAudio } from "./audio";
import { emptyInput, type PlayerInput } from "./input";
import {
  TILE, FUSES_NEEDED, ONLINE_TIME, SOLO_PAR_TIME, GRACE_TIME,
  clamp, lerp, rand, angLerp, dist2,
  type RunConfig, type Phase, type EndReason, type Survivor, type Killer,
  type Fuse, type Locker, type WeaponItem, type Flare, type Particle, type Popup,
  type Ring, type Stinger, type Camera, type ScoreBreakdown, type EndPayload,
  type HudData, type EngineEvent, type Role, type Snapshot, type NetEvent, type WeaponKind, type RunStats,
} from "./types";

const ACCEL = 2400;
const S_WALK = 168, S_SPRINT = 240;
const K_WALK = 152, K_SPRINT = 220;

interface Setup {
  fuses: { x: number; y: number }[];
  weapons: { x: number; y: number; kind: WeaponKind }[];
}

export class Engine {
  map: GameMap = buildMap(0);
  audio = new HorrorAudio();
  config: RunConfig = { mode: "solo", difficulty: "normal", localRole: "survivor", variant: 0 };
  phase: Phase = "run";
  paused = false;
  remote = false; // true côté invité : pas de simulation, interpolation + prédiction
  time = 0;
  introT = 0;
  survivor!: Survivor;
  killer!: Killer;
  fuses: Fuse[] = [];
  lockers: Locker[] = [];
  weapons: WeaponItem[] = [];
  flares: Flare[] = [];
  inv = { taser: 0, flare: 0 };
  fuseCount = 0;
  gateOpen = false;
  particles: Particle[] = [];
  popups: Popup[] = [];
  rings: Ring[] = [];
  stingers: Stinger[] = [];
  cameras: Camera[] = [];
  decal!: HTMLCanvasElement;
  decalCtx!: CanvasRenderingContext2D;
  danger = 0;
  chase = false;
  endT = 0;
  endReason: EndReason = "caught";
  killerWinner = false;
  hitStop = 0;
  slowMo = 1;
  onEvent: (e: EngineEvent) => void = () => {};
  prompt = "";
  netEvents: NetEvent[] = [];
  cosmetics = { survivor: "recrue", killer: "boucher", lamp: "ambre" };
  hides = 0;
  flaresUsed = 0;
  private predS = { x: 0, y: 0, dir: 0 };
  private predK = { x: 0, y: 0, dir: 0 };
  private snapDanger = 0;
  private fusePts = 0; private chainPts = 0; private chain = 0; private chainT = 0;
  private closeCalls = 0; private closePts = 0; private nearT = 0; private closeCd = 0;
  private stuns = 0; private stunPts = 0;
  private noises: { x: number; y: number; r: number; t: number }[] = [];
  private stingerCd = 0;
  private sixthT = 22;
  private lastBeep = -1;
  private escapePts = 0; private timePts = 0;

  get nightmare() { return this.config.difficulty === "nightmare"; }
  get solo() { return this.config.mode === "solo"; }
  get localRole(): Role { return this.config.localRole; }
  get online() { return this.config.mode === "online"; }

  private net(k: string, x?: number, y?: number, v?: number, s?: string) {
    if (this.online && !this.remote) {
      this.netEvents.push({ k, x, y, v, s });
      if (this.netEvents.length > 60) this.netEvents.shift();
    }
  }

  startRun(config: RunConfig, setup?: Setup) {
    this.config = { ...config };
    this.map = buildMap(config.variant);
    this.phase = "run"; this.paused = false; this.remote = false;
    this.time = 0; this.introT = 3.8;
    this.fuseCount = 0; this.gateOpen = false;
    this.particles = []; this.popups = []; this.rings = []; this.stingers = [];
    this.flares = []; this.inv = { taser: 0, flare: 0 };
    this.danger = 0; this.chase = false; this.endT = 0; this.hitStop = 0; this.slowMo = 1;
    this.fusePts = 0; this.chainPts = 0; this.chain = 0; this.chainT = 0;
    this.closeCalls = 0; this.closePts = 0; this.nearT = 0; this.closeCd = 0;
    this.stuns = 0; this.stunPts = 0;
    this.noises = []; this.stingerCd = 0; this.sixthT = 22; this.lastBeep = -1;
    this.escapePts = 0; this.timePts = 0; this.killerWinner = false; this.prompt = "";
    this.netEvents = [];
    this.hides = 0; this.flaresUsed = 0;

    let fusePos: { x: number; y: number }[];
    let weaponPos: { x: number; y: number; kind: WeaponKind }[];
    if (setup) {
      fusePos = setup.fuses;
      weaponPos = setup.weapons;
    } else {
      const spots = [...this.map.fuseSpots];
      const first = spots.shift()!;
      for (let i = spots.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      fusePos = [first, ...spots.slice(0, 5)];
      const ws = [...this.map.weaponSpots];
      for (let i = ws.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [ws[i], ws[j]] = [ws[j], ws[i]];
      }
      weaponPos = [
        { ...ws[0], kind: "taser" as WeaponKind },
        { ...ws[1], kind: "flare" as WeaponKind },
      ];
    }
    this.fuses = fusePos.map((s) => ({ x: s.x, y: s.y, taken: false, seed: Math.random() * 10 }));
    this.weapons = weaponPos.map((s) => ({ ...s, taken: false, seed: Math.random() * 10 }));
    this.lockers = this.map.lockers.map((l) => ({ x: l.x, y: l.y, open: false }));

    const p = this.map.spawnP, k = this.map.spawnK;
    this.survivor = {
      x: p.x, y: p.y, vx: 0, vy: 0, dir: 0.6, stamina: 100, exhausted: false, regenDelay: 0,
      sprinting: false, moving: false, stepT: 0, bob: 0, hidden: -1, alive: true, deathT: 0,
      hideWitnessed: false,
    };
    this.killer = {
      x: k.x, y: k.y, vx: 0, vy: 0, dir: Math.PI, stamina: 100, exhausted: false, regenDelay: 0,
      sprinting: false, moving: false, stepT: 0, twitch: 0,
      attackCd: 0, attackAnim: 0, senseCd: 0, senseT: 0, stunT: 0, isBot: this.solo,
      brain: this.solo ? "dormant" : "patrol", path: [], repathT: 0, target: null,
      lastSeen: null, lostT: 0, lookT: 0, searchLeft: 0, ripT: 0, ripLocker: -1,
    };
    this.predS = { x: p.x, y: p.y, dir: 0.6 };
    this.predK = { x: k.x, y: k.y, dir: Math.PI };
    const local = this.localRole === "survivor" ? p : k;
    this.cameras = [{ x: local.x, y: local.y, zoom: 1, shake: 0, sx: 0, sy: 0, follow: this.localRole }];

    this.decal = document.createElement("canvas");
    this.decal.width = this.map.pxW; this.decal.height = this.map.pxH;
    this.decalCtx = this.decal.getContext("2d")!;

    this.audio.setDuck(1);
    if (this.localRole === "survivor") {
      this.addStinger("TROUVEZ 5 FUSIBLES · ALIMENTEZ LA PORTE",
        this.solo ? "ne le laissez pas vous entendre courir" : "le boucher vous traque", "#d9d2c0", 3.4);
    } else {
      this.addStinger("TRAQUEZ LE SURVIVANT", "empêchez-le d'ouvrir la porte", "#ff2b3f", 3.4);
    }
  }

  addStinger(text: string, sub: string, color: string, dur = 2.2) {
    this.stingers = this.stingers.filter((s) => s.text !== text);
    this.stingers.push({ text, sub, color, t: dur, max: dur });
    if (this.stingers.length > 2) this.stingers.shift();
  }

  addShake(amount: number, who: "all" | Role = "all") {
    for (const c of this.cameras)
      if (who === "all" || c.follow === who) c.shake = Math.min(26, c.shake + amount);
  }

  private addNoise(x: number, y: number, r: number) {
    this.noises.push({ x, y, r: r * (this.nightmare ? 1.35 : 1), t: 0.6 });
  }

  burst(x: number, y: number, n: number, kind: Particle["kind"], color: string, speed = 160, grav = 0) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 420) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.2, 1) * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: rand(0.35, kind === "smoke" ? 1.6 : 0.9),
        size: kind === "smoke" ? rand(6, 16) : rand(1.5, 4),
        color, kind, grav,
      });
    }
  }

  private stampBlood(x: number, y: number, big: boolean) {
    const c = this.decalCtx;
    for (let i = 0; i < (big ? 26 : 8); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * (big ? 52 : 20);
      c.fillStyle = `rgba(${(90 + Math.random() * 40) | 0},8,16,${rand(0.25, 0.6)})`;
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(2, big ? 15 : 7), 0, Math.PI * 2);
      c.fill();
    }
  }

  private popup(x: number, y: number, text: string, color: string) {
    this.popups.push({ x, y, text, color, t: 0 });
    if (this.popups.length > 12) this.popups.shift();
  }

  // ── mise à jour autoritaire (solo / hôte) ──
  update(dtRaw: number, inputs: { survivor: PlayerInput; killer: PlayerInput }) {
    if (this.paused || this.phase === "done") return;
    dtRaw = Math.min(dtRaw, 1 / 25);
    if (this.hitStop > 0) { this.hitStop -= dtRaw; return; }
    const dt = dtRaw * this.slowMo;
    const running = this.phase === "run";
    if (running) this.time += dt;
    this.introT = Math.max(0, this.introT - dtRaw);
    this.stingerCd = Math.max(0, this.stingerCd - dt);
    this.closeCd = Math.max(0, this.closeCd - dt);
    this.chainT = Math.max(0, this.chainT - dt);
    if (this.chainT === 0) this.chain = 0;

    const zero = emptyInput();
    const sIn = running ? inputs.survivor : zero;
    const kIn = running ? inputs.killer : zero;

    this.updateSurvivor(dt, sIn);
    if (this.killer.isBot) this.updateBot(dt);
    else this.updateHumanKiller(dt, kIn);

    if (running) {
      this.objectives(dt);
      this.dangerCalc(dt);
      if (this.online) {
        const remain = ONLINE_TIME - this.time;
        if (remain <= 10.5) {
          const sec = Math.ceil(remain);
          if (sec !== this.lastBeep && sec > 0) { this.lastBeep = sec; this.audio.timeLow(); }
        }
        if (remain <= 0) this.finish("timeup");
      }
    }

    this.updateFx(dt, dtRaw);

    if (this.phase === "ending") {
      this.endT += dtRaw;
      this.survivor.deathT += dtRaw;
      const wait = this.endReason === "caught" ? 1.55 : this.endReason === "escaped" ? 1.5 : 1.3;
      if (this.endT >= wait) {
        this.phase = "done";
        this.audio.setDuck(0.35);
        this.onEvent({ type: "end", payload: this.buildPayload() });
      }
    }
  }

  // ── FX communs (hôte + invité) ──
  private updateFx(dt: number, dtRaw: number) {
    for (const fl of this.flares) {
      fl.t -= dt;
      if (Math.random() < dt * 22) {
        this.burst(fl.x + rand(-4, 4), fl.y + rand(-4, 4), 1, "spark",
          Math.random() < 0.5 ? "#ff5a3c" : "#ffd0a0", 90, -140);
      }
    }
    this.flares = this.flares.filter((f) => f.t > 0);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      const drag = p.kind === "smoke" ? 0.985 : 0.94;
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].t += dt;
      if (this.popups[i].t > 1.15) this.popups.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t > 0.9) this.rings.splice(i, 1);
    }
    for (let i = this.stingers.length - 1; i >= 0; i--) {
      this.stingers[i].t -= dtRaw;
      if (this.stingers[i].t <= 0) this.stingers.splice(i, 1);
    }
    for (let i = this.noises.length - 1; i >= 0; i--) {
      this.noises[i].t -= dt;
      if (this.noises[i].t <= 0) this.noises.splice(i, 1);
    }
    for (const c of this.cameras) {
      const ent = c.follow === "survivor" ? this.survivor : this.killer;
      const look = 34;
      const tx = ent.x + Math.cos(ent.dir) * look;
      const ty = ent.y + Math.sin(ent.dir) * look;
      const f = 1 - Math.exp(-6.5 * dtRaw);
      c.x = lerp(c.x, tx, f); c.y = lerp(c.y, ty, f);
      c.shake *= Math.exp(-6 * dtRaw);
      if (c.shake < 0.08) c.shake = 0;
      c.sx = rand(-1, 1) * c.shake; c.sy = rand(-1, 1) * c.shake;
    }
  }

  // ── survivant ──
  private updateSurvivor(dt: number, inp: PlayerInput) {
    const s = this.survivor;
    if (!s.alive) { s.vx = 0; s.vy = 0; return; }

    // armes
    if (inp.taserQ && this.inv.taser > 0 && s.hidden < 0) {
      this.inv.taser--;
      this.audio.taser();
      this.rings.push({ x: s.x, y: s.y, r: 12, max: 110, color: "rgba(120,200,255,0.7)", t: 0 });
      this.burst(s.x + Math.cos(s.dir) * 20, s.y + Math.sin(s.dir) * 20, 10, "spark", "#9fd8ff", 200);
      const k = this.killer;
      const d2 = dist2(s.x, s.y, k.x, k.y);
      const ang = Math.atan2(k.y - s.y, k.x - s.x);
      let dAng = Math.abs(ang - s.dir) % (Math.PI * 2);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      const hit = d2 < 115 * 115 && dAng < 1.5 && this.map.los(s.x, s.y, k.x, k.y);
      if (hit) {
        k.stunT = 2.5;
        if (k.isBot) k.brain = "stunned";
        this.stuns++; this.stunPts += 100;
        this.popup(k.x, k.y - 24, "PARADE +100", "#9fd8ff");
        this.burst(k.x, k.y, 22, "spark", "#9fd8ff", 240);
        this.addShake(7);
        this.addNoise(k.x, k.y, 260);
        if (this.localRole === "survivor") this.addStinger("PARADE !", "il est étourdi — courez", "#9fd8ff", 1.6);
      }
      this.net("taser", k.x, k.y, hit ? 1 : 0);
    }
    if (inp.flareQ && this.inv.flare > 0 && s.hidden < 0) {
      this.inv.flare--;
      const fx = s.x + Math.cos(s.dir) * 30, fy = s.y + Math.sin(s.dir) * 30;
      const spot = this.map.nearestFloor(fx, fy);
      this.flares.push({ x: spot.x, y: spot.y, t: 6.5, seed: Math.random() * 10 });
      this.flaresUsed++;
      this.audio.flare();
      this.burst(spot.x, spot.y, 12, "spark", "#ff5a3c", 150, -60);
      this.net("flare", spot.x, spot.y);
    }

    // cachettes
    if (inp.actionQ) {
      if (s.hidden >= 0) {
        const l = this.lockers[s.hidden];
        s.hidden = -1;
        const spot = this.map.nearestFloor(l.x + 30, l.y + 30);
        s.x = spot.x; s.y = spot.y;
        this.audio.hide();
        this.addNoise(s.x, s.y, 200);
        this.net("unhide", s.x, s.y);
      } else {
        for (let i = 0; i < this.lockers.length; i++) {
          const l = this.lockers[i];
          if (dist2(s.x, s.y, l.x, l.y) < 46 * 46) {
            s.hidden = i;
            s.x = l.x; s.y = l.y; s.vx = 0; s.vy = 0;
            l.open = false;
            s.hideWitnessed =
              dist2(s.x, s.y, this.killer.x, this.killer.y) < 190 * 190 &&
              this.map.los(s.x, s.y, this.killer.x, this.killer.y);
            this.audio.hide();
            this.burst(l.x, l.y, 6, "dust", "rgba(150,150,140,0.5)", 60);
            if (this.localRole === "survivor") this.addStinger("CACHÉ", "retenez votre souffle", "#9fb4c8", 1.4);
            if (s.hideWitnessed && this.killer.isBot) {
              this.killer.brain = "ripopen";
              this.killer.ripLocker = i;
              this.killer.ripT = 0;
              this.killer.repathT = 0;
            }
            this.hides++;
            this.net("hide", l.x, l.y);
            break;
          }
        }
      }
    }
    if (s.hidden >= 0) {
      s.stamina = Math.min(100, s.stamina + 30 * dt);
      if (s.stamina >= 22) s.exhausted = false;
      s.moving = false; s.sprinting = false;
      return;
    }

    this.moveAgent(s, inp.mx, inp.my, inp.sprint, S_WALK, S_SPRINT, 26, 20, dt);
    s.bob += dt * (s.moving ? (s.sprinting ? 14 : 9) : 2);
    if (s.moving) {
      s.stepT -= dt;
      if (s.stepT <= 0) {
        s.stepT = s.sprinting ? 0.24 : 0.38;
        this.audio.step(s.sprinting, false);
        this.burst(s.x, s.y + 8, 1, "dust", "rgba(120,120,110,0.35)", 26);
        if (s.sprinting) this.addNoise(s.x, s.y, 300);
      }
    }
  }

  private moveAgent(
    a: { x: number; y: number; vx: number; vy: number; dir: number; stamina: number; exhausted: boolean; regenDelay: number; sprinting: boolean; moving: boolean },
    mx: number, my: number, wantSprint: boolean, walk: number, sprint: number,
    drain: number, regen: number, dt: number,
  ) {
    const mag = Math.hypot(mx, my);
    const moving = mag > 0.1;
    const canSprint = wantSprint && moving && !a.exhausted && a.stamina > 0;
    a.sprinting = canSprint;
    a.moving = moving;
    if (canSprint) {
      a.stamina = Math.max(0, a.stamina - drain * dt);
      a.regenDelay = 0.75;
      if (a.stamina <= 0) a.exhausted = true;
    } else {
      a.regenDelay = Math.max(0, a.regenDelay - dt);
      if (a.regenDelay <= 0) a.stamina = Math.min(100, a.stamina + regen * dt);
      if (a.exhausted && a.stamina >= 24) a.exhausted = false;
    }
    const spd = canSprint ? sprint : walk;
    const tvx = moving ? (mx / Math.max(1, mag)) * spd * Math.min(1, mag) : 0;
    const tvy = moving ? (my / Math.max(1, mag)) * spd * Math.min(1, mag) : 0;
    const f = 1 - Math.exp((-ACCEL / spd) * dt * 0.9);
    a.vx = lerp(a.vx, tvx, f);
    a.vy = lerp(a.vy, tvy, f);
    const res = this.map.moveCircle(a.x, a.y, 13, a.vx * dt, a.vy * dt);
    a.x = res.x; a.y = res.y;
    if (moving) a.dir = angLerp(a.dir, Math.atan2(my, mx), 1 - Math.exp(-14 * dt));
  }

  // ── boucher humain ──
  private updateHumanKiller(dt: number, inp: PlayerInput) {
    const k = this.killer;
    k.attackCd = Math.max(0, k.attackCd - dt);
    k.attackAnim = Math.max(0, k.attackAnim - dt);
    k.senseCd = Math.max(0, k.senseCd - dt);
    k.senseT = Math.max(0, k.senseT - dt);
    k.twitch = Math.max(0, k.twitch - dt);
    if (Math.random() < dt * 0.7) k.twitch = 0.12;
    if (k.stunT > 0) {
      k.stunT = Math.max(0, k.stunT - dt);
      k.vx *= 0.82; k.vy *= 0.82;
      const res = this.map.moveCircle(k.x, k.y, 14, k.vx * dt, k.vy * dt);
      k.x = res.x; k.y = res.y;
      if (Math.random() < dt * 14) this.burst(k.x + rand(-12, 12), k.y + rand(-12, 12), 2, "spark", "#9fd8ff", 120);
      return;
    }

    if (inp.senseQ && k.senseCd <= 0) {
      k.senseT = 3; k.senseCd = 12;
      this.audio.sense();
      this.rings.push({ x: k.x, y: k.y, r: 10, max: 420, color: "rgba(255,43,63,0.5)", t: 0 });
      this.net("sense", k.x, k.y);
    }
    if (inp.actionQ && k.attackCd <= 0) {
      k.attackCd = 0.85; k.attackAnim = 0.24;
      k.vx += Math.cos(k.dir) * 240; k.vy += Math.sin(k.dir) * 240;
      this.audio.swing();
      this.net("swing", k.x, k.y);
      const s = this.survivor;
      if (s.alive) {
        if (s.hidden >= 0) {
          const l = this.lockers[s.hidden];
          if (dist2(k.x, k.y, l.x, l.y) < 64 * 64) {
            this.lockers[s.hidden].open = true;
            this.audio.rip();
            this.net("rip", l.x, l.y);
            this.kill();
          }
        } else {
          const d2 = dist2(k.x, k.y, s.x, s.y);
          const ang = Math.atan2(s.y - k.y, s.x - k.x);
          let dAng = Math.abs(ang - k.dir) % (Math.PI * 2);
          if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
          if (d2 < 66 * 66 && dAng < 1.25 && this.map.los(k.x, k.y, s.x, s.y)) this.kill();
          else if (d2 < 120 * 120) this.addShake(3, "killer");
        }
      }
    }
    this.moveAgent(k, inp.mx, inp.my, inp.sprint, K_WALK, K_SPRINT, 22, 18, dt);
    if (k.moving) {
      k.stepT -= dt;
      if (k.stepT <= 0) {
        k.stepT = k.sprinting ? 0.26 : 0.4;
        this.audio.step(k.sprinting, true);
      }
    }
  }

  // ── boucher robot ──
  private updateBot(dt: number) {
    const k = this.killer, s = this.survivor;
    k.twitch = Math.max(0, k.twitch - dt);
    if (Math.random() < dt * 0.8) k.twitch = 0.12;
    k.attackAnim = Math.max(0, k.attackAnim - dt);
    k.senseT = Math.max(0, k.senseT - dt);

    if (k.stunT > 0) {
      k.stunT = Math.max(0, k.stunT - dt);
      k.vx *= 0.8; k.vy *= 0.8;
      k.moving = false;
      if (Math.random() < dt * 14) this.burst(k.x + rand(-12, 12), k.y + rand(-12, 12), 2, "spark", "#9fd8ff", 120);
      if (k.stunT === 0) {
        k.brain = "search"; k.searchLeft = 2;
        k.target = k.lastSeen ? { ...k.lastSeen } : null;
        k.repathT = 0;
      }
      return;
    }

    if (k.brain === "dormant") {
      if (this.time >= GRACE_TIME && this.phase === "run") {
        k.brain = "patrol";
        this.addStinger("IL EST RÉVEILLÉ", "le boucher arpente les couloirs", "#ff2b3f", 2.6);
        this.audio.sense();
        this.net("awake");
      } else return;
    }
    if (this.phase !== "run") { k.vx = 0; k.vy = 0; return; }

    // répulsion par les fusées éclairantes — il hait la lumière
    let repel: Flare | null = null, rd = Infinity;
    for (const fl of this.flares) {
      const d = dist2(k.x, k.y, fl.x, fl.y);
      if (d < 175 * 175 && d < rd) { rd = d; repel = fl; }
    }
    if (repel) {
      const ang = Math.atan2(k.y - repel.y, k.x - repel.x);
      const f = 1 - Math.exp(-8 * dt);
      k.vx = lerp(k.vx, Math.cos(ang) * 195, f);
      k.vy = lerp(k.vy, Math.sin(ang) * 195, f);
      k.dir = angLerp(k.dir, ang, 1 - Math.exp(-8 * dt));
      const res = this.map.moveCircle(k.x, k.y, 14, k.vx * dt, k.vy * dt);
      k.x = res.x; k.y = res.y;
      k.moving = true;
      k.path = [];
      return;
    }

    const sight = this.nightmare ? 430 : 340;
    const fov = this.nightmare ? 2.3 : 1.9;
    const d2s = dist2(k.x, k.y, s.x, s.y);
    const angTo = Math.atan2(s.y - k.y, s.x - k.x);
    let dAng = Math.abs(angTo - k.dir) % (Math.PI * 2);
    if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
    const clear = d2s < sight * sight && this.map.los(k.x, k.y, s.x, s.y);
    const canSee = s.alive && s.hidden < 0 && clear && (dAng < fov / 2 || d2s < 120 * 120);

    for (const n of this.noises) {
      if (k.brain === "chase" || k.brain === "ripopen") continue;
      if (dist2(k.x, k.y, n.x, n.y) < n.r * n.r) {
        k.brain = "investigate";
        k.target = { x: n.x, y: n.y };
        k.repathT = 0; k.lookT = 0;
      }
    }
    if (this.nightmare) {
      this.sixthT -= dt;
      if (this.sixthT <= 0) {
        this.sixthT = 22;
        if (k.brain === "patrol" || k.brain === "search") {
          k.brain = "investigate";
          k.target = { x: s.x + rand(-70, 70), y: s.y + rand(-70, 70) };
          k.repathT = 0;
        }
      }
    }

    if (canSee) {
      if (k.brain !== "chase" && this.stingerCd <= 0) {
        this.stingerCd = 6;
        this.addStinger("IL VOUS VOIT", "COUREZ", "#ff2b3f", 1.6);
        this.audio.sting();
        this.addShake(5);
        this.net("sting");
      }
      k.brain = "chase";
      k.lastSeen = { x: s.x, y: s.y };
      k.lostT = 0;
      k.target = { x: s.x, y: s.y };
    }

    let speed = this.nightmare ? 148 : 132;
    switch (k.brain) {
      case "chase": {
        speed = this.nightmare ? 233 : 209;
        if (d2s < 130 * 130) speed += 26;
        k.repathT -= dt;
        if (k.repathT <= 0) { k.repathT = 0.28; k.path = this.map.path(k.x, k.y, s.x, s.y); }
        if (!canSee) {
          k.lostT += dt;
          if (k.lostT > 2.3) {
            k.brain = "search"; k.searchLeft = 3;
            k.target = k.lastSeen ? { ...k.lastSeen } : null;
            k.repathT = 0;
          }
        }
        if (s.hidden < 0 && d2s < 40 * 40 && clear) { k.attackAnim = 0.24; this.kill(); return; }
        break;
      }
      case "investigate": {
        speed = this.nightmare ? 190 : 172;
        if (!k.target) { k.brain = "patrol"; break; }
        k.repathT -= dt;
        if (k.repathT <= 0) { k.repathT = 0.8; k.path = this.map.path(k.x, k.y, k.target.x, k.target.y); }
        if (dist2(k.x, k.y, k.target.x, k.target.y) < 40 * 40 || k.path.length === 0) {
          k.lookT += dt;
          k.dir += dt * 2.4;
          k.vx = 0; k.vy = 0;
          if (k.lookT > 1.7) { k.brain = "patrol"; k.target = null; k.lookT = 0; }
          return;
        }
        break;
      }
      case "search": {
        speed = 165;
        if (!k.target || dist2(k.x, k.y, k.target.x, k.target.y) < 36 * 36) {
          k.searchLeft--;
          if (k.searchLeft <= 0) { k.brain = "patrol"; k.target = null; break; }
          const base = k.lastSeen ?? { x: k.x, y: k.y };
          const spot = this.map.nearestFloor(base.x + rand(-160, 160), base.y + rand(-160, 160));
          k.target = spot; k.repathT = 0;
        }
        k.repathT -= dt;
        if (k.repathT <= 0) { k.repathT = 0.9; k.path = this.map.path(k.x, k.y, k.target!.x, k.target!.y); }
        break;
      }
      case "ripopen": {
        speed = 205;
        const l = this.lockers[k.ripLocker];
        if (!l) { k.brain = "patrol"; break; }
        k.repathT -= dt;
        if (k.repathT <= 0) { k.repathT = 0.5; k.path = this.map.path(k.x, k.y, l.x, l.y); }
        if (dist2(k.x, k.y, l.x, l.y) < 52 * 52) {
          k.ripT += dt;
          k.vx = 0; k.vy = 0;
          k.dir = angLerp(k.dir, Math.atan2(l.y - k.y, l.x - k.x), 0.2);
          if (k.ripT > 0.75) {
            l.open = true;
            this.audio.rip();
            this.addShake(7);
            this.net("rip", l.x, l.y);
            if (s.hidden === k.ripLocker) { this.kill(); return; }
            k.brain = "search"; k.searchLeft = 2; k.lastSeen = { x: l.x, y: l.y }; k.target = null;
          }
          return;
        }
        break;
      }
      default: {
        if (!k.target || dist2(k.x, k.y, k.target.x, k.target.y) < 42 * 42 || k.path.length === 0) {
          const wps = this.map.waypoints;
          let wp = wps[(Math.random() * wps.length) | 0];
          for (let i = 0; i < 4 && dist2(k.x, k.y, wp.x, wp.y) < 200 * 200; i++)
            wp = wps[(Math.random() * wps.length) | 0];
          k.target = wp;
          k.path = this.map.path(k.x, k.y, wp.x, wp.y);
        }
        k.repathT -= dt;
        if (k.repathT <= 0) { k.repathT = 1.4; k.path = this.map.path(k.x, k.y, k.target.x, k.target.y); }
      }
    }

    while (k.path.length && dist2(k.x, k.y, k.path[0].x, k.path[0].y) < 14 * 14) k.path.shift();
    if (k.path.length) {
      const n = k.path[0];
      const dx = n.x - k.x, dy = n.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = 1 - Math.exp(-9 * dt);
      k.vx = lerp(k.vx, (dx / d) * speed, f);
      k.vy = lerp(k.vy, (dy / d) * speed, f);
      k.dir = angLerp(k.dir, Math.atan2(dy, dx), 1 - Math.exp(-10 * dt));
    } else {
      k.vx *= 0.8; k.vy *= 0.8;
    }
    const res = this.map.moveCircle(k.x, k.y, 14, k.vx * dt, k.vy * dt);
    k.x = res.x; k.y = res.y;
    k.moving = Math.hypot(k.vx, k.vy) > 20;
    if (k.moving) {
      k.stepT -= dt;
      if (k.stepT <= 0) {
        k.stepT = k.brain === "chase" ? 0.26 : 0.42;
        this.audio.step(k.brain === "chase", true);
      }
    }
  }

  // ── objectifs & score ──
  private objectives(dt: number) {
    const s = this.survivor;
    if (!s.alive || s.hidden >= 0) { this.prompt = s.hidden >= 0 ? "SORTIR DU CASIER" : ""; return; }

    for (const w of this.weapons) {
      if (w.taken || dist2(s.x, s.y, w.x, w.y) > 30 * 30) continue;
      w.taken = true;
      this.inv[w.kind] = Math.min(2, this.inv[w.kind] + 1);
      const label = w.kind === "taser" ? "+ TASER" : "+ FUSÉE";
      const col = w.kind === "taser" ? "#9fd8ff" : "#ff5a3c";
      this.popup(w.x, w.y - 18, label, col);
      this.audio.weapon();
      this.burst(w.x, w.y, 12, "spark", col, 160);
      this.net("weapon", w.x, w.y, w.kind === "taser" ? 1 : 0);
    }

    for (const f of this.fuses) {
      if (f.taken || dist2(s.x, s.y, f.x, f.y) > 34 * 34) continue;
      f.taken = true;
      this.fuseCount++;
      if (this.chainT > 0) this.chain++;
      this.chainT = 20;
      const bonus = this.chain * 50;
      this.fusePts += 250;
      this.chainPts += bonus;
      this.popup(f.x, f.y - 20, bonus > 0 ? `+${250 + bonus} CHAÎNE x${this.chain + 1}` : "+250", "#ffb347");
      this.audio.pickup(this.chain);
      this.burst(f.x, f.y, 20, "spark", "#ffb347", 190);
      this.burst(f.x, f.y, 5, "smoke", "rgba(255,179,71,0.25)", 40);
      this.rings.push({ x: f.x, y: f.y, r: 8, max: 90, color: "rgba(255,179,71,0.6)", t: 0 });
      this.addShake(3.5);
      this.addNoise(f.x, f.y, 470);
      this.net("pickup", f.x, f.y, bonus);
      if (this.fuseCount >= FUSES_NEEDED && !this.gateOpen) {
        this.gateOpen = true;
        this.audio.gate();
        this.addStinger("LA PORTE EST OUVERTE", "sortez. sortez maintenant.", "#5dff9d", 3);
        this.rings.push({ x: this.map.exit.x, y: this.map.exit.y, r: 10, max: 300, color: "rgba(93,255,157,0.5)", t: 0 });
        this.burst(this.map.exit.x, this.map.exit.y, 34, "ember", "#5dff9d", 150, -60);
        this.addShake(8);
        this.addNoise(this.map.exit.x, this.map.exit.y, 4000);
        this.net("gate", this.map.exit.x, this.map.exit.y);
      }
    }

    const kd = dist2(s.x, s.y, this.killer.x, this.killer.y);
    if (kd < 135 * 135) this.nearT += dt;
    else if (kd > 310 * 310) {
      if (this.nearT > 0.35 && this.closeCd <= 0 && this.killer.brain !== "dormant" && this.killer.stunT <= 0) {
        this.closeCalls++; this.closePts += 50; this.closeCd = 4;
        this.popup(s.x, s.y - 26, "FRÔLÉ +50", "#ff2b3f");
        this.net("close", s.x, s.y);
      }
      this.nearT = 0;
    }

    const ex = this.map.exit;
    const nearGate = dist2(s.x, s.y, ex.x, ex.y) < 90 * 90;
    let nearLocker = false;
    for (const l of this.lockers)
      if (dist2(s.x, s.y, l.x, l.y) < 46 * 46) { nearLocker = true; break; }
    const left = FUSES_NEEDED - this.fuseCount;
    this.prompt = nearGate
      ? this.gateOpen ? "FUYEZ PAR LA PORTE" : `PORTE VERROUILLÉE — ${left} FUSIBLE${left === 1 ? "" : "S"} RESTANT${left === 1 ? "" : "S"}`
      : nearLocker ? "SE CACHER DANS LE CASIER" : "";
    if (this.gateOpen && dist2(s.x, s.y, ex.x, ex.y) < 52 * 52) this.finish("escaped");
  }

  private dangerCalc(dt: number) {
    const s = this.survivor, k = this.killer;
    const d = Math.sqrt(dist2(s.x, s.y, k.x, k.y));
    let target = clamp(1 - (d - 90) / 520, 0, 1);
    this.chase = k.isBot && k.brain === "chase";
    if (this.chase) target = Math.max(target, 0.55);
    if (s.hidden >= 0) target *= 0.5;
    if (k.brain === "dormant") target *= 0.25;
    if (k.stunT > 0) target *= 0.4;
    this.danger = lerp(this.danger, target, 1 - Math.exp(-4 * dt));
    this.audio.tick(dt, this.phase === "run" ? this.danger : 0);
  }

  private kill() {
    if (this.phase !== "run") return;
    const s = this.survivor;
    s.alive = false;
    if (s.hidden >= 0) { this.lockers[s.hidden].open = true; s.hidden = -1; }
    this.phase = "ending"; this.endReason = "caught"; this.endT = 0;
    this.slowMo = 0.22; this.hitStop = 0.09;
    this.killerWinner = true;
    this.audio.kill();
    this.addShake(22);
    this.burst(s.x, s.y, 60, "blood", "#a3122a", 260, 300);
    this.burst(s.x, s.y, 12, "smoke", "rgba(163,18,42,0.4)", 60);
    this.stampBlood(s.x, s.y, true);
    this.addStinger("ATTRAPÉ", "", "#ff2b3f", 1.4);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([90, 40, 120]);
    if (this.localRole === "survivor") this.onEvent({ type: "caught-flash" });
    this.net("kill", s.x, s.y);
  }

  private finish(reason: EndReason) {
    if (this.phase !== "run") return;
    this.phase = "ending"; this.endReason = reason; this.endT = 0;
    if (reason === "escaped") {
      this.slowMo = 0.55;
      this.escapePts = 1000;
      this.timePts = this.solo
        ? Math.max(0, Math.round((SOLO_PAR_TIME - this.time) * 5))
        : Math.round((ONLINE_TIME - this.time) * 4);
      this.audio.escape();
      this.addStinger(this.localRole === "survivor" ? "VOUS VOUS ÊTES ÉCHAPPÉ" : "IL S'EST ÉCHAPPÉ", "", "#5dff9d", 1.5);
      this.burst(this.survivor.x, this.survivor.y, 40, "ember", "#5dff9d", 180, -80);
      this.killerWinner = false;
      this.net("escape", this.survivor.x, this.survivor.y);
    } else {
      this.slowMo = 0.5;
      this.killerWinner = true;
      this.audio.sting();
      this.addStinger("LE HOLLOW VOUS RÉCLAME", "le boucher l'emporte", "#ff2b3f", 1.5);
      this.net("timeup");
    }
  }

  private buildPayload(): EndPayload {
    const mult = this.nightmare && this.solo ? 1.5 : 1;
    const raw = this.fusePts + this.chainPts + this.closePts + this.stunPts + this.escapePts + this.timePts;
    const score: ScoreBreakdown = {
      fuses: this.fuseCount, fusePts: this.fusePts, chainPts: this.chainPts,
      closeCalls: this.closeCalls, closePts: this.closePts,
      stuns: this.stuns, stunPts: this.stunPts,
      escapePts: this.escapePts, timePts: this.timePts, mult,
      total: Math.round(raw * mult), timeSec: Math.round(this.time), escaped: this.endReason === "escaped",
    };
    const win = this.online
      ? this.localRole === "survivor" ? this.endReason === "escaped" : this.killerWinner
      : this.endReason === "escaped";
    const stats: RunStats = {
      fuses: this.fuseCount, stuns: this.stuns, closeCalls: this.closeCalls,
      hides: this.hides, flares: this.flaresUsed, timeSec: Math.round(this.time),
      escaped: this.endReason === "escaped", win, mode: this.config.mode,
    };
    return { reason: this.endReason, config: { ...this.config }, score, killerWinner: this.killerWinner, stats };
  }

  getHud(): HudData {
    const remain = ONLINE_TIME - this.time;
    const t = this.solo ? this.time : Math.max(0, remain);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    return {
      fuses: this.fuseCount, needed: FUSES_NEEDED,
      score: this.fusePts + this.chainPts + this.closePts + this.stunPts + this.escapePts + this.timePts,
      timeLabel: `${mm}:${ss.toString().padStart(2, "0")}`,
      countdown: this.online,
      danger: this.danger, chase: this.chase,
      staminaS: this.survivor.stamina, staminaK: this.killer.stamina,
      exhaustedS: this.survivor.exhausted, exhaustedK: this.killer.exhausted,
      hidden: this.survivor.hidden >= 0, gateOpen: this.gateOpen, prompt: this.prompt,
      senseReady: this.killer.isBot ? 0 : 1 - this.killer.senseCd / 12,
      attackReady: this.killer.isBot ? 0 : 1 - this.killer.attackCd / 0.85,
      intro: this.introT,
      role: this.localRole, taser: this.inv.taser, flare: this.inv.flare,
      stunned: this.killer.stunT > 0, online: this.online,
    };
  }

  applyCosmetics(survivor: string, killer: string, lamp: string) {
    this.cosmetics = { survivor, killer, lamp };
  }

  nearestFuse(): { x: number; y: number } | null {
    if (this.gateOpen) return this.map.exit;
    let best: Fuse | null = null, bd = Infinity;
    for (const f of this.fuses) {
      if (f.taken) continue;
      const d = dist2(this.survivor.x, this.survivor.y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // ── réseau : instantané côté hôte ──
  snapshot(): Snapshot {
    const s = this.survivor, k = this.killer;
    return {
      t: this.time, phase: this.phase, time: this.time, intro: this.introT,
      s: {
        x: s.x, y: s.y, dir: s.dir, stam: s.stamina, exh: s.exhausted, spr: s.sprinting,
        mov: s.moving, hid: s.hidden, alive: s.alive, bob: s.bob, deathT: s.deathT,
      },
      k: {
        x: k.x, y: k.y, dir: k.dir, stam: k.stamina, exh: k.exhausted, spr: k.sprinting,
        mov: k.moving, brain: k.brain, atk: k.attackAnim, senseT: k.senseT, stunT: k.stunT, tw: k.twitch > 0,
      },
      f: this.fuses.map((f) => (f.taken ? 1 : 0)),
      lock: this.lockers.map((l) => (l.open ? 1 : 0)),
      w: this.weapons.map((w) => (w.taken ? 1 : 0)),
      fc: this.fuseCount, gate: this.gateOpen,
      danger: this.danger, chase: this.chase,
      inv: { ...this.inv },
      flares: this.flares.map((f) => ({ x: f.x, y: f.y, t: f.t, seed: f.seed })),
      reason: this.phase === "run" ? null : this.endReason,
      kw: this.killerWinner, endT: this.endT, slow: this.slowMo,
      ev: this.netEvents.splice(0),
    };
  }

  // ── réseau : application côté invité ──
  applySnapshot(snap: Snapshot) {
    this.time = snap.time; this.phase = snap.phase; this.introT = snap.intro;
    this.fuseCount = snap.fc; this.gateOpen = snap.gate;
    this.chase = snap.chase; this.snapDanger = snap.danger;
    this.killerWinner = snap.kw; this.endT = snap.endT;
    if (snap.reason) this.endReason = snap.reason;
    const s = this.survivor, k = this.killer;
    s.stamina = snap.s.stam; s.exhausted = snap.s.exh; s.sprinting = snap.s.spr;
    s.moving = snap.s.mov; s.hidden = snap.s.hid; s.alive = snap.s.alive;
    s.bob = snap.s.bob; s.deathT = snap.s.deathT;
    k.stamina = snap.k.stam; k.exhausted = snap.k.exh; k.sprinting = snap.k.spr;
    k.moving = snap.k.mov; k.brain = snap.k.brain; k.attackAnim = snap.k.atk;
    k.senseT = snap.k.senseT; k.stunT = snap.k.stunT; k.twitch = snap.k.tw ? 0.12 : 0;
    this.predS = { x: snap.s.x, y: snap.s.y, dir: snap.s.dir };
    this.predK = { x: snap.k.x, y: snap.k.y, dir: snap.k.dir };
    snap.f.forEach((v, i) => { if (this.fuses[i]) this.fuses[i].taken = v === 1; });
    snap.lock.forEach((v, i) => { if (this.lockers[i]) this.lockers[i].open = v === 1; });
    snap.w.forEach((v, i) => { if (this.weapons[i]) this.weapons[i].taken = v === 1; });
    this.inv = { ...snap.inv };
    this.flares = snap.flares.map((f) => ({ ...f }));
    for (const ev of snap.ev) this.applyNetEvent(ev);
  }

  private applyNetEvent(ev: NetEvent) {
    const x = ev.x ?? 0, y = ev.y ?? 0;
    switch (ev.k) {
      case "pickup": {
        const bonus = ev.v ?? 0;
        this.popup(x, y - 20, bonus > 0 ? `+${250 + bonus} CHAÎNE` : "+250", "#ffb347");
        this.audio.pickup(bonus > 0 ? 2 : 0);
        this.burst(x, y, 20, "spark", "#ffb347", 190);
        this.rings.push({ x, y, r: 8, max: 90, color: "rgba(255,179,71,0.6)", t: 0 });
        this.addShake(3.5);
        break;
      }
      case "gate":
        this.audio.gate();
        this.addStinger("LA PORTE EST OUVERTE", "sortez. sortez maintenant.", "#5dff9d", 3);
        this.rings.push({ x, y, r: 10, max: 300, color: "rgba(93,255,157,0.5)", t: 0 });
        this.burst(x, y, 34, "ember", "#5dff9d", 150, -60);
        this.addShake(8);
        break;
      case "kill":
        this.survivor.alive = false;
        this.audio.kill();
        this.addShake(22);
        this.burst(x, y, 60, "blood", "#a3122a", 260, 300);
        this.stampBlood(x, y, true);
        this.addStinger("ATTRAPÉ", "", "#ff2b3f", 1.4);
        if (navigator.vibrate) navigator.vibrate([90, 40, 120]);
        if (this.localRole === "survivor") this.onEvent({ type: "caught-flash" });
        break;
      case "escape":
        this.audio.escape();
        this.addStinger(this.localRole === "survivor" ? "VOUS VOUS ÊTES ÉCHAPPÉ" : "IL S'EST ÉCHAPPÉ", "", "#5dff9d", 1.5);
        this.burst(x, y, 40, "ember", "#5dff9d", 180, -80);
        break;
      case "timeup":
        this.audio.sting();
        this.addStinger("LE HOLLOW VOUS RÉCLAME", "le boucher l'emporte", "#ff2b3f", 1.5);
        break;
      case "sting":
        this.addStinger("IL VOUS VOIT", "COUREZ", "#ff2b3f", 1.6);
        this.audio.sting();
        this.addShake(5);
        break;
      case "awake":
        this.addStinger("IL EST RÉVEILLÉ", "le boucher arpente les couloirs", "#ff2b3f", 2.6);
        this.audio.sense();
        break;
      case "hide":
        this.audio.hide();
        this.burst(x, y, 6, "dust", "rgba(150,150,140,0.5)", 60);
        if (this.localRole === "survivor") this.addStinger("CACHÉ", "retenez votre souffle", "#9fb4c8", 1.4);
        break;
      case "unhide": this.audio.hide(); break;
      case "rip": this.audio.rip(); this.addShake(7); break;
      case "sense":
        this.audio.sense();
        this.rings.push({ x, y, r: 10, max: 420, color: "rgba(255,43,63,0.5)", t: 0 });
        break;
      case "swing": this.audio.swing(); break;
      case "taser": {
        this.audio.taser();
        this.burst(x, y, ev.v ? 22 : 8, "spark", "#9fd8ff", 220);
        if (ev.v) {
          this.addShake(7);
          if (this.localRole === "survivor") {
            this.popup(x, y - 24, "PARADE +100", "#9fd8ff");
            this.addStinger("PARADE !", "il est étourdi — courez", "#9fd8ff", 1.6);
          } else {
            this.addStinger("ÉTOURDI !", "le taser vous a touché", "#9fd8ff", 1.6);
          }
        }
        break;
      }
      case "flare":
        this.audio.flare();
        this.burst(x, y, 12, "spark", "#ff5a3c", 150, -60);
        break;
      case "weapon": {
        const col = ev.v ? "#9fd8ff" : "#ff5a3c";
        this.popup(x, y - 18, ev.v ? "+ TASER" : "+ FUSÉE", col);
        this.audio.weapon();
        this.burst(x, y, 12, "spark", col, 160);
        break;
      }
      case "close": this.popup(x, y - 26, "FRÔLÉ +50", "#ff2b3f"); break;
    }
  }

  // ── boucle invité : interpolation + prédiction locale ──
  updateRemote(dt: number, localInput: PlayerInput) {
    dt = Math.min(dt, 1 / 25);
    this.introT = Math.max(0, this.introT - dt);
    const own = this.localRole === "survivor" ? this.survivor : this.killer;
    const other = this.localRole === "survivor" ? this.killer : this.survivor;
    const ownPred = this.localRole === "survivor" ? this.predS : this.predK;
    const otherPred = this.localRole === "survivor" ? this.predK : this.predS;
    const running = this.phase === "run";

    // prédiction de son propre personnage
    const canPredict = running && this.survivor.alive &&
      (this.localRole === "killer" ? this.killer.stunT <= 0 : this.survivor.hidden < 0);
    if (canPredict) {
      const isS = this.localRole === "survivor";
      this.moveAgent(own, localInput.mx, localInput.my, localInput.sprint,
        isS ? S_WALK : K_WALK, isS ? S_SPRINT : K_SPRINT, isS ? 26 : 22, isS ? 20 : 18, dt);
      const err = dist2(own.x, own.y, ownPred.x, ownPred.y);
      if (err > 90 * 90) { own.x = ownPred.x; own.y = ownPred.y; }
      else {
        const f = 1 - Math.exp(-3.2 * dt);
        own.x = lerp(own.x, ownPred.x, f);
        own.y = lerp(own.y, ownPred.y, f);
      }
    } else if (this.survivor.hidden >= 0 && this.localRole === "survivor") {
      own.x = ownPred.x; own.y = ownPred.y;
    }
    // l'adversaire arrive par le réseau
    const f2 = 1 - Math.exp(-13 * dt);
    other.x = lerp(other.x, otherPred.x, f2);
    other.y = lerp(other.y, otherPred.y, f2);
    other.dir = angLerp(other.dir, otherPred.dir, f2);

    // pas + poussières locales
    for (const ent of [this.survivor, this.killer]) {
      if (ent.moving && this.survivor.alive) {
        ent.stepT -= dt;
        if (ent.stepT <= 0) {
          ent.stepT = ent.sprinting ? 0.26 : 0.4;
          this.audio.step(ent.sprinting, ent === this.killer);
          this.burst(ent.x, ent.y + 8, 1, "dust", "rgba(120,120,110,0.3)", 24);
        }
      }
    }
    this.survivor.bob += dt * (this.survivor.moving ? 10 : 2);

    this.danger = lerp(this.danger, this.snapDanger, 1 - Math.exp(-4 * dt));
    this.audio.tick(dt, running ? this.danger : 0);
    if (this.online && running) {
      const remain = ONLINE_TIME - this.time;
      if (remain <= 10.5) {
        const sec = Math.ceil(remain);
        if (sec !== this.lastBeep && sec > 0) { this.lastBeep = sec; this.audio.timeLow(); }
      }
    }
    this.updateFx(dt, dt);
  }
}
