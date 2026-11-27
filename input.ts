// Unified input: keyboard (2 players), touch (floating joystick per half), mouse (aim + fire).
import { W, H, type FrameInput, type Mode, type TouchView } from "./types";

const JOY_MAX = 90; // logical px for full stick deflection
const MOUSE_IDLE_MS = 2500;

const P0_MOVE = { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"] };
const P1_MOVE = { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] };
const P0_FIRE = ["Space"];
const P1_FIRE = ["Enter", "ShiftRight"];
const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "ShiftRight",
]);

interface ActivePointer {
  p: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export class InputController {
  private keys = new Set<string>();
  private pointers = new Map<number, ActivePointer>();
  private mouse = { x: W / 2, y: H / 2, lastMove: -1e9, down: false };
  private canvas: HTMLCanvasElement | null = null;
  mode: Mode = "solo";
  /** Set by the host to true while the game should consume gameplay keys. */
  captureKeys = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.captureKeys && GAME_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pointers.clear();
    this.mouse.down = false;
  };

  private toLogical(e: PointerEvent | MouseEvent) {
    const c = this.canvas!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * W,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * H,
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.toLogical(e);
    if (e.pointerType === "mouse") {
      if (e.button === 0) this.mouse.down = true;
      this.mouse.x = x;
      this.mouse.y = y;
      this.mouse.lastMove = performance.now();
      return;
    }
    const p = this.mode === "duel" ? (x < W / 2 ? 0 : 1) : 0;
    for (const v of this.pointers.values()) if (v.p === p) return; // one thumb per half
    this.pointers.set(e.pointerId, { p, ox: x, oy: y, x, y });
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.toLogical(e);
    if (e.pointerType === "mouse") {
      this.mouse.x = x;
      this.mouse.y = y;
      this.mouse.lastMove = performance.now();
      return;
    }
    const v = this.pointers.get(e.pointerId);
    if (v) {
      v.x = x;
      v.y = y;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (e.button === 0) this.mouse.down = false;
      return;
    }
    this.pointers.delete(e.pointerId);
  };

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("pointerdown", this.onPointerDown);
      canvas.removeEventListener("pointermove", this.onPointerMove);
      canvas.removeEventListener("pointerup", this.onPointerUp);
      canvas.removeEventListener("pointercancel", this.onPointerUp);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas = null;
  }

  private axis(moves: { left: string[]; right: string[]; up: string[]; down: string[] }[]) {
    let mx = 0;
    let my = 0;
    const K = this.keys;
    for (const m of moves) {
      if (m.left.some((k) => K.has(k))) mx -= 1;
      if (m.right.some((k) => K.has(k))) mx += 1;
      if (m.up.some((k) => K.has(k))) my -= 1;
      if (m.down.some((k) => K.has(k))) my += 1;
    }
    return { mx, my };
  }

  /** Sample all inputs for this frame. */
  getFrame(now: number): FrameInput {
    const K = this.keys;
    const p0 = { mx: 0, my: 0, fire: false };
    const p1 = { mx: 0, my: 0, fire: false };

    if (this.mode === "solo") {
      const a = this.axis([P0_MOVE, P1_MOVE]);
      p0.mx = a.mx;
      p0.my = a.my;
      p0.fire = P0_FIRE.some((k) => K.has(k)) || P1_FIRE.some((k) => K.has(k));
    } else {
      const a = this.axis([P0_MOVE]);
      const b = this.axis([P1_MOVE]);
      p0.mx = a.mx;
      p0.my = a.my;
      p0.fire = P0_FIRE.some((k) => K.has(k));
      p1.mx = b.mx;
      p1.my = b.my;
      p1.fire = P1_FIRE.some((k) => K.has(k));
    }

    const touches: TouchView[] = [];
    for (const v of this.pointers.values()) {
      const target = v.p === 0 ? p0 : p1;
      const dx = v.x - v.ox;
      const dy = v.y - v.oy;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        const mag = Math.min(1, len / JOY_MAX);
        target.mx += (dx / len) * mag;
        target.my += (dy / len) * mag;
      }
      target.fire = true; // touching your half = auto-fire
      touches.push({ p: v.p, ox: v.ox, oy: v.oy, x: v.x, y: v.y });
    }

    for (const t of [p0, p1]) {
      t.mx = Math.max(-1, Math.min(1, t.mx));
      t.my = Math.max(-1, Math.min(1, t.my));
    }

    const mouseActive = now - this.mouse.lastMove < MOUSE_IDLE_MS;
    if (mouseActive && this.mouse.down) p0.fire = true;

    return {
      p: [p0, p1],
      mouse: { x: this.mouse.x, y: this.mouse.y, active: mouseActive, fire: this.mouse.down },
      touches,
    };
  }

  clearPressed() {
    this.keys.clear();
    this.pointers.clear();
    this.mouse.down = false;
  }
}
