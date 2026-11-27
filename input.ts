// ── THE HOLLOW · clavier (ZQSD/WASD) + tactile ──────────────────────────────
import type { Mode, Role } from "./types";

export interface PlayerInput {
  mx: number; my: number;
  sprint: boolean;
  actionQ: boolean; // cacher / attaque
  senseQ: boolean;  // sens du boucher
  taserQ: boolean;
  flareQ: boolean;
}

export const emptyInput = (): PlayerInput => ({
  mx: 0, my: 0, sprint: false, actionQ: false, senseQ: false, taserQ: false, flareQ: false,
});

interface TouchState {
  jx: number; jy: number;
  sprint: boolean;
  actionQ: boolean; senseQ: boolean; taserQ: boolean; flareQ: boolean;
}

const GAME_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter",
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "KeyF", "KeyG", "ShiftLeft", "ShiftRight",
]);

export class InputManager {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private touch: TouchState = { jx: 0, jy: 0, sprint: false, actionQ: false, senseQ: false, taserQ: false, flareQ: false };
  private cleanups: (() => void)[] = [];
  active = false;

  attach() {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.active && GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.edges.clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.cleanups.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    });
  }

  destroy() { this.cleanups.forEach((c) => c()); this.cleanups = []; }

  attachZone(el: HTMLElement) {
    const base = document.createElement("div");
    base.className = "joy-base";
    const nub = document.createElement("div");
    nub.className = "joy-nub";
    base.appendChild(nub);
    base.style.display = "none";
    el.appendChild(base);
    let pid = -1, ox = 0, oy = 0;
    const R = 52;
    const t = this.touch;
    const setNub = (dx: number, dy: number) => { nub.style.transform = `translate(${dx}px, ${dy}px)`; };
    const onDown = (e: PointerEvent) => {
      if (pid !== -1) return;
      pid = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      base.style.display = "block";
      base.style.left = `${ox}px`; base.style.top = `${oy}px`;
      setNub(0, 0);
      t.jx = 0; t.jy = 0;
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const r = el.getBoundingClientRect();
      let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      setNub(dx, dy);
      t.jx = dx / R; t.jy = dy / R;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1; t.jx = 0; t.jy = 0;
      base.style.display = "none";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    const cleanup = () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      base.remove();
    };
    this.cleanups.push(cleanup);
    return cleanup;
  }

  setTouchBtn(btn: "sprint" | "action" | "sense" | "taser" | "flare", down: boolean) {
    const t = this.touch;
    if (btn === "sprint") t.sprint = down;
    else if (down) {
      if (btn === "action") t.actionQ = true;
      else if (btn === "sense") t.senseQ = true;
      else if (btn === "taser") t.taserQ = true;
      else t.flareQ = true;
    }
  }

  /** Échantillonne l'entrée locale pour le rôle joué (chacun son appareil en ligne). */
  sample(_mode: Mode, role: Role): PlayerInput {
    const k = this.keys, e = this.edges, t = this.touch;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    const joy = Math.abs(t.jx) + Math.abs(t.jy) > 0.12;
    const out: PlayerInput = {
      mx: joy ? t.jx : x,
      my: joy ? t.jy : y,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || t.sprint,
      actionQ: e.has("KeyE") || e.has("Space") || e.has("Enter") || t.actionQ,
      senseQ: role === "killer" && (e.has("KeyQ") || t.senseQ),
      taserQ: role === "survivor" && (e.has("KeyF") || t.taserQ),
      flareQ: role === "survivor" && (e.has("KeyG") || t.flareQ),
    };
    this.edges.clear();
    t.actionQ = t.senseQ = t.taserQ = t.flareQ = false;
    return out;
  }
}
