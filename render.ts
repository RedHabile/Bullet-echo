// ── THE HOLLOW · rendu canvas (monde pré-cuit 2.5D + éclairage dynamique) ───
import type { Engine } from "./engine";
import { TILE, clamp, lerp, dist2, type Camera, type Role } from "./types";
import type { GameMap } from "./map";
import { drawSurvivorSprite, drawKillerSprite, hexA } from "./sprites";
import { lookSurvivor, lookKiller, lampColor } from "./meta";

interface Viewport { x: number; y: number; w: number; h: number; cam: Camera; role: Role; }

const FONT = '"Special Elite", "Courier New", monospace';
const WALL_H = 12;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: HTMLCanvasElement | null = null;
  private worldVariant = -1;
  private light: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private grain: HTMLCanvasElement;
  private fogBlob: HTMLCanvasElement;
  private vignettes = new Map<string, HTMLCanvasElement>();
  private floorImg: HTMLImageElement | null = null;
  private wallImg: HTMLImageElement | null = null;
  private cssW = 300; private cssH = 150; private dpr = 1;
  private t = 0;
  private gateAnim = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.light = document.createElement("canvas");
    this.lightCtx = this.light.getContext("2d")!;
    this.grain = document.createElement("canvas");
    this.grain.width = 140; this.grain.height = 140;
    const gc = this.grain.getContext("2d")!;
    const id = gc.createImageData(140, 140);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v;
      id.data[i + 3] = 26;
    }
    gc.putImageData(id, 0, 0);
    this.fogBlob = document.createElement("canvas");
    this.fogBlob.width = 256; this.fogBlob.height = 256;
    const fc = this.fogBlob.getContext("2d")!;
    const fg = fc.createRadialGradient(128, 128, 10, 128, 128, 128);
    fg.addColorStop(0, "rgba(125,147,168,0.55)");
    fg.addColorStop(0.6, "rgba(125,147,168,0.22)");
    fg.addColorStop(1, "rgba(125,147,168,0)");
    fc.fillStyle = fg; fc.fillRect(0, 0, 256, 256);
  }

  async init() {
    const load = (src: string) =>
      new Promise<HTMLImageElement | null>((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
        setTimeout(() => res(null), 6000);
      });
    const [f, w] = await Promise.all([load("/images/floor.jpg"), load("/images/wall.jpg")]);
    this.floorImg = f && f.naturalWidth > 0 ? f : null;
    this.wallImg = w && w.naturalWidth > 0 ? w : null;
  }

  resize(cssW: number, cssH: number) {
    this.cssW = Math.max(200, cssW); this.cssH = Math.max(200, cssH);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.vignettes.clear();
  }

  // ── pré-cuisson du monde ──
  buildWorld(map: GameMap) {
    this.worldVariant = map.variant;
    const c = document.createElement("canvas");
    c.width = map.pxW; c.height = map.pxH;
    const g = c.getContext("2d")!;

    // sol
    if (this.floorImg) {
      const pat = g.createPattern(this.floorImg, "repeat")!;
      g.fillStyle = pat;
    } else g.fillStyle = "#181c1e";
    g.fillRect(0, 0, map.pxW, map.pxH);
    g.fillStyle = "rgba(6,9,13,0.58)";
    g.fillRect(0, 0, map.pxW, map.pxH);

    const propTiles = new Set<number>();
    for (const pr of map.props)
      for (let j = pr.y; j < pr.y + pr.h; j++)
        for (let i = pr.x; i < pr.x + pr.w; i++) propTiles.add(j * map.w + i);

    // salissures par dalle + fissures
    for (let ty = 0; ty < map.h; ty++)
      for (let tx = 0; tx < map.w; tx++) {
        if (map.solidTile(tx, ty)) continue;
        const r = Math.random();
        g.fillStyle = `rgba(0,0,0,${(r * 0.15).toFixed(3)})`;
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        if (r > 0.92) {
          g.strokeStyle = "rgba(0,0,0,0.35)";
          g.lineWidth = 1;
          g.beginPath();
          let x = tx * TILE + Math.random() * TILE, y = ty * TILE + Math.random() * TILE;
          g.moveTo(x, y);
          for (let i = 0; i < 3; i++) {
            x += (Math.random() - 0.5) * 26; y += (Math.random() - 0.5) * 26;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      }

    // graffitis
    const scrawls: [number, number, string, number][] = map.variant === 0
      ? [[11.5, 4.2, "IL ÉCOUTE", -0.12], [20.5, 4.6, "NE COURS PAS", 0.08],
         [7.6, 13.4, "AUCUNE ISSUE", -0.05], [35.6, 13.4, "DIEU EST PARTI", 0.14],
         [24.2, 21.6, "IL PORTE SON VISAGE", -0.1], [9.4, 23.6, "SILENCE", 0.03]]
      : [[5, 7.6, "CELLULE 6 : VIDE", -0.06], [17, 7.6, "ILS ONT GRATTÉ", 0.07],
         [29, 7.6, "307 NUITS", -0.04], [19, 15.6, "LA LUMIÈRE LE BRÛLE", 0.02],
         [7, 23.7, "PARDON", -0.08], [31, 23.7, "NE CRIE PAS", 0.05]];
    for (const [tx, ty, text, rot] of scrawls) {
      g.save();
      g.translate(tx * TILE, ty * TILE);
      g.rotate(rot);
      g.font = `700 ${17 + Math.random() * 5}px ${FONT}`;
      g.fillStyle = "rgba(140,20,30,0.17)";
      g.fillText(text, 0, 0);
      g.restore();
    }
    // vieilles taches de sang
    const stainSpots = map.variant === 0
      ? [[36, 10], [24, 19], [12, 12], [19, 26], [7, 19], [28, 2]]
      : [[16, 5], [31, 22], [19, 14], [19, 26], [6, 22], [28, 5]];
    for (const [tx, ty] of stainSpots) {
      for (let i = 0; i < 9; i++) {
        const x = tx * TILE + (Math.random() - 0.5) * 70;
        const y = ty * TILE + (Math.random() - 0.5) * 70;
        g.fillStyle = `rgba(70,10,16,${0.1 + Math.random() * 0.16})`;
        g.beginPath();
        g.ellipse(x, y, 4 + Math.random() * 13, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // papiers épars
    for (let i = 0; i < 46; i++) {
      const tx = (1 + Math.random() * (map.w - 2)) | 0, ty = (1 + Math.random() * (map.h - 2)) | 0;
      if (map.solidTile(tx, ty)) continue;
      g.save();
      g.translate(tx * TILE + Math.random() * TILE, ty * TILE + Math.random() * TILE);
      g.rotate(Math.random() * Math.PI);
      g.fillStyle = `rgba(190,185,165,${0.05 + Math.random() * 0.07})`;
      g.fillRect(-5, -7, 10, 14);
      g.restore();
    }

    // puits de lune (fenêtres à barreaux)
    for (const mt of map.moonTiles) {
      const x = mt.x * TILE, y = mt.y * TILE;
      g.save();
      const gr = g.createLinearGradient(x, y, x + 34, y + 120);
      gr.addColorStop(0, "rgba(150,180,225,0.14)");
      gr.addColorStop(1, "rgba(150,180,225,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x + 4, y); g.lineTo(x + TILE - 4, y);
      g.lineTo(x + TILE + 26, y + 120); g.lineTo(x + 30, y + 120);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (let b = 0; b < 3; b++) {
        g.save();
        g.translate(x + 12 + b * 12, y);
        g.transform(1, 0, 0.22, 1, 0, 0);
        g.fillRect(0, 0, 4, 118);
        g.restore();
      }
      g.restore();
    }

    // murs 2.5D : face supérieure décalée + face avant
    for (let ty = 0; ty < map.h; ty++)
      for (let tx = 0; tx < map.w; tx++) {
        if (!map.solidTile(tx, ty) || propTiles.has(ty * map.w + tx)) continue;
        const x = tx * TILE, y = ty * TILE;
        const topY = y - WALL_H;
        if (this.wallImg) {
          g.drawImage(this.wallImg,
            (tx * 97) % Math.max(1, this.wallImg.width - 96),
            (ty * 61) % Math.max(1, this.wallImg.height - 96), 96, 96,
            x, topY, TILE, TILE);
        } else {
          g.fillStyle = "#232a30";
          g.fillRect(x, topY, TILE, TILE);
        }
        g.fillStyle = `rgba(8,11,16,${0.5 + Math.random() * 0.12})`;
        g.fillRect(x, topY, TILE, TILE);
        g.fillStyle = "rgba(200,220,235,0.07)";
        g.fillRect(x, topY, TILE, 2);
        g.fillRect(x, topY, 2, TILE);
        g.fillStyle = "rgba(0,0,0,0.4)";
        g.fillRect(x + TILE - 2, topY, 2, TILE);
        // face avant vers le sol en dessous
        if (!map.solidTile(tx, ty + 1) || propTiles.has((ty + 1) * map.w + tx)) {
          const fy = y + TILE - WALL_H;
          const gr = g.createLinearGradient(0, fy, 0, fy + WALL_H);
          gr.addColorStop(0, "#3a434c");
          gr.addColorStop(0.25, "#242b32");
          gr.addColorStop(1, "#0c0f13");
          g.fillStyle = gr;
          g.fillRect(x, fy, TILE, WALL_H);
          g.fillStyle = "rgba(140,160,175,0.14)";
          g.fillRect(x, fy, TILE, 1.5);
          if (Math.random() > 0.7) {
            g.fillStyle = "rgba(60,80,70,0.25)";
            g.fillRect(x + Math.random() * 30, fy + 2, 6 + Math.random() * 10, WALL_H - 3);
          }
        }
      }

    // occlusion ambiante + encadrements de portes
    for (let ty = 0; ty < map.h - 1; ty++)
      for (let tx = 0; tx < map.w; tx++) {
        if (map.solidTile(tx, ty)) continue;
        if (map.solidTile(tx, ty - 1)) {
          const gr = g.createLinearGradient(0, ty * TILE, 0, ty * TILE + 18);
          gr.addColorStop(0, "rgba(0,0,0,0.52)"); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr;
          g.fillRect(tx * TILE, ty * TILE, TILE, 18);
        }
        if (map.solidTile(tx - 1, ty)) {
          const gr = g.createLinearGradient(tx * TILE, 0, tx * TILE + 10, 0);
          gr.addColorStop(0, "rgba(0,0,0,0.32)"); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr;
          g.fillRect(tx * TILE, ty * TILE, 10, TILE);
        }
        const wallNotProp = (i: number, j: number) =>
          map.solidTile(i, j) && !propTiles.has(j * map.w + i);
        const lr = wallNotProp(tx - 1, ty) && wallNotProp(tx + 1, ty);
        const ud = wallNotProp(tx, ty - 1) && wallNotProp(tx, ty + 1);
        if (lr !== ud) {
          g.fillStyle = "rgba(46,34,24,0.9)";
          if (lr) {
            g.fillRect(tx * TILE, ty * TILE, 5, TILE);
            g.fillRect(tx * TILE + TILE - 5, ty * TILE, 5, TILE);
          } else {
            g.fillRect(tx * TILE, ty * TILE, TILE, 5);
            g.fillRect(tx * TILE, ty * TILE + TILE - 5, TILE, 5);
          }
        }
      }

    // mobilier solide
    for (const pr of map.props) this.drawProp(g, pr.x * TILE, pr.y * TILE, pr.w * TILE, pr.h * TILE, pr.kind);

    // suspensions des lampes
    for (const l of map.lamps) {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.beginPath(); g.ellipse(l.x, l.y + 4, 10, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2b3138";
      g.beginPath(); g.arc(l.x, l.y, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1a1f24";
      g.beginPath(); g.arc(l.x, l.y, 4.5, 0, Math.PI * 2); g.fill();
    }

    this.world = c;
  }

  private drawProp(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: string) {
    g.save();
    g.translate(x, y);
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.beginPath(); g.ellipse(w / 2, h - 2, w * 0.55, 8, 0, 0, Math.PI * 2); g.fill();
    switch (kind) {
      case "bed": {
        g.fillStyle = "#3a4149"; g.fillRect(4, 2, w - 8, h - 6);
        g.fillStyle = "#59616a"; g.fillRect(7, 6, w - 14, h - 14);
        g.fillStyle = "#8d8a7a"; g.fillRect(7, 6, w - 14, 16); // oreiller
        g.fillStyle = "rgba(90,20,24,0.35)";
        g.beginPath(); g.ellipse(w / 2, h * 0.6, 10, 14, 0.3, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#20262c"; g.lineWidth = 2; g.strokeRect(4, 2, w - 8, h - 6);
        g.fillStyle = "#20262c"; g.fillRect(4, h / 2, w - 8, 3); // sangle
        break;
      }
      case "slab": {
        g.fillStyle = "#4c565f"; g.fillRect(3, 2, w - 6, h - 6);
        g.fillStyle = "#9aa0a4"; g.fillRect(6, 5, w - 12, h - 12);
        g.fillStyle = "rgba(210,208,198,0.35)"; g.fillRect(6, 5, w - 12, h * 0.5);
        g.strokeStyle = "#242a30"; g.lineWidth = 2; g.strokeRect(3, 2, w - 6, h - 6);
        break;
      }
      case "shelf": {
        g.fillStyle = "#3d3126"; g.fillRect(2, 4, w - 4, h - 10);
        g.fillStyle = "#241d16"; g.fillRect(5, 7, w - 10, h - 16);
        for (let i = 0; i < Math.floor(w / 14); i++) {
          g.fillStyle = ["#5a5346", "#4a5560", "#6b5a4a", "#3f4a42"][i % 4];
          g.fillRect(7 + i * 13, 9, 9, h - 20);
        }
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(2, h - 8, w - 4, 4);
        break;
      }
      case "boiler": {
        g.fillStyle = "#262c31"; g.fillRect(2, 2, w - 4, h - 6);
        g.fillStyle = "#3a434b"; g.fillRect(6, 6, w - 12, h - 14);
        g.strokeStyle = "#57493a"; g.lineWidth = 4;
        g.beginPath(); g.moveTo(8, 10); g.lineTo(w - 8, 10); g.stroke();
        g.beginPath(); g.moveTo(w / 2, 12); g.lineTo(w / 2, h - 10); g.stroke();
        g.fillStyle = "#161a1e"; g.beginPath(); g.arc(w * 0.3, h * 0.6, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(255,120,60,0.5)"; g.beginPath(); g.arc(w * 0.3, h * 0.6, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#4c565f"; g.beginPath(); g.arc(w * 0.72, h * 0.55, 7, 0, Math.PI * 2); g.fill();
        break;
      }
      case "bench": {
        g.fillStyle = "#3d3126"; g.fillRect(3, h * 0.3, w - 6, h * 0.4);
        g.fillStyle = "#241d16";
        g.fillRect(5, h * 0.3 + 3, w - 10, 3);
        g.fillRect(5, h * 0.3 + 10, w - 10, 3);
        g.fillStyle = "#20262c"; g.fillRect(6, h * 0.7, 5, h * 0.25); g.fillRect(w - 11, h * 0.7, 5, h * 0.25);
        break;
      }
      case "table": {
        g.fillStyle = "#4c565f"; g.fillRect(3, 6, w - 6, h - 14);
        g.fillStyle = "#6a747e"; g.fillRect(6, 9, w - 12, h - 20);
        g.fillStyle = "rgba(140,20,30,0.4)";
        g.beginPath(); g.ellipse(w * 0.5, h * 0.45, 12, 7, 0.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#20262c";
        g.fillRect(5, h - 9, 4, 6); g.fillRect(w - 9, h - 9, 4, 6);
        break;
      }
      case "crate": {
        g.fillStyle = "#4a3b2a"; g.fillRect(5, 5, w - 10, h - 10);
        g.strokeStyle = "#2c2318"; g.lineWidth = 2.5;
        g.strokeRect(5, 5, w - 10, h - 10);
        g.beginPath(); g.moveTo(5, 5); g.lineTo(w - 5, h - 5); g.moveTo(w - 5, 5); g.lineTo(5, h - 5); g.stroke();
        break;
      }
      case "barrel": {
        g.fillStyle = "#3a434b"; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#57493a"; g.lineWidth = 3;
        g.beginPath(); g.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2); g.stroke();
        g.fillStyle = "rgba(120,80,40,0.4)";
        g.beginPath(); g.arc(w * 0.4, h * 0.4, 5, 0, Math.PI * 2); g.fill();
        break;
      }
    }
    g.restore();
  }

  private vignette(w: number, h: number): HTMLCanvasElement {
    const key = `${w}x${h}`;
    let v = this.vignettes.get(key);
    if (v) return v;
    v = document.createElement("canvas");
    v.width = Math.max(2, w); v.height = Math.max(2, h);
    const g = v.getContext("2d")!;
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.62)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    this.vignettes.set(key, v);
    return v;
  }

  render(eng: Engine, dt: number) {
    this.t += dt;
    if (this.worldVariant !== eng.map.variant) this.buildWorld(eng.map);
    this.gateAnim = lerp(this.gateAnim, eng.gateOpen ? 1 : 0, 1 - Math.exp(-3 * dt));
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#020308";
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const cam = eng.cameras[0];
    this.renderViewport(eng, { x: 0, y: 0, w: this.cssW, h: this.cssH, cam, role: cam.follow });

    ctx.save();
    ctx.globalAlpha = 0.55;
    const ox = (Math.random() * 140) | 0, oy = (Math.random() * 140) | 0;
    const pat = ctx.createPattern(this.grain, "repeat")!;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, this.cssW + 140, this.cssH + 140);
    ctx.restore();
  }

  private renderViewport(eng: Engine, vp: Viewport) {
    const ctx = this.ctx;
    const m = eng.map;
    const small = Math.min(vp.w, vp.h) < 520;
    const z = clamp(Math.min(vp.w, vp.h) / 620, 0.62, 1.15);
    vp.cam.zoom = z;
    const halfW = vp.w / (2 * z), halfH = vp.h / (2 * z);
    const cx = m.pxW <= halfW * 2 ? m.pxW / 2 : clamp(vp.cam.x, halfW, m.pxW - halfW);
    const cy = m.pxH <= halfH * 2 ? m.pxH / 2 : clamp(vp.cam.y, halfH, m.pxH - halfH);
    const camX = cx + vp.cam.sx / z, camY = cy + vp.cam.sy / z;
    const toX = (wx: number) => (wx - camX) * z + vp.w / 2 + vp.x;
    const toY = (wy: number) => (wy - camY) * z + vp.h / 2 + vp.y;

    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();

    ctx.save();
    ctx.translate(vp.x + vp.w / 2, vp.y + vp.h / 2);
    ctx.scale(z, z);
    ctx.translate(-camX, -camY);
    if (this.world) ctx.drawImage(this.world, 0, 0);
    ctx.drawImage(eng.decal, 0, 0);

    this.drawGate(ctx, eng);
    for (const f of eng.fuses) if (!f.taken) this.drawFuse(ctx, f.x, f.y, f.seed);
    for (const w of eng.weapons) if (!w.taken) this.drawWeapon(ctx, w.x, w.y, w.kind, w.seed);
    for (let i = 0; i < eng.lockers.length; i++) this.drawLocker(ctx, eng, i);
    for (const fl of eng.flares) this.drawFlareCore(ctx, fl.x, fl.y, fl.seed);

    const s = eng.survivor, k = eng.killer;
    if (s.y <= k.y) { this.drawSurvivor(ctx, eng); this.drawKiller(ctx, eng); }
    else { this.drawKiller(ctx, eng); this.drawSurvivor(ctx, eng); }

    // arcs électriques du taser
    if (k.stunT > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(159,216,255,0.85)";
      ctx.lineWidth = 1.6;
      for (let a = 0; a < 3; a++) {
        ctx.beginPath();
        let ax = k.x + (Math.random() - 0.5) * 30, ay = k.y + (Math.random() - 0.5) * 30;
        ctx.moveTo(ax, ay);
        for (let i = 0; i < 3; i++) {
          ax += (Math.random() - 0.5) * 22; ay += (Math.random() - 0.5) * 22;
          ctx.lineTo(ax, ay);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const p of eng.particles) {
      const a = 1 - p.life / p.max;
      if (p.kind === "smoke") {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + p.life * 1.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.lighting(eng, vp, z, camX, camY, toX, toY);

    // poussières en suspension
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 22; i++) {
      const wx = camX - halfW + (((i * 137.5 + this.t * (4 + (i % 5))) % (halfW * 2)) + halfW * 2) % (halfW * 2);
      const wy = camY - halfH + (((i * 89.3 + this.t * (2 + (i % 3)) + Math.sin(this.t * 0.5 + i) * 20) % (halfH * 2)) + halfH * 2) % (halfH * 2);
      ctx.globalAlpha = 0.05 + 0.05 * Math.sin(this.t * 0.8 + i * 2.2);
      ctx.fillStyle = "#cfd8e0";
      ctx.beginPath(); ctx.arc(toX(wx), toY(wy), (0.8 + (i % 3) * 0.5) * z, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // brume
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 5; i++) {
      const fx = vp.x + ((Math.sin(this.t * 0.05 + i * 2.7) * 0.5 + 0.5) * 1.3 - 0.15) * vp.w;
      const fy = vp.y + ((Math.cos(this.t * 0.04 + i * 1.9) * 0.5 + 0.5) * 1.3 - 0.15) * vp.h;
      const fs = Math.max(vp.w, vp.h) * (0.5 + (i % 3) * 0.22);
      ctx.globalAlpha = 0.05 + (i % 2) * 0.03;
      ctx.drawImage(this.fogBlob, fx - fs / 2, fy - fs / 2, fs, fs);
    }
    ctx.restore();

    const owner = vp.role === "survivor" ? s : k;
    // yeux rouges dans le noir
    if (vp.role === "survivor" && k.brain !== "dormant") {
      const ex = toX(k.x), ey = toY(k.y);
      const seen = m.los(owner.x, owner.y, k.x, k.y);
      const a = seen ? 0.95 : 0.4;
      const eyeCol = lookKiller(eng.cosmetics.killer).eyes;
      const px = Math.cos(k.dir + Math.PI / 2) * 3.4 * z, py = Math.sin(k.dir + Math.PI / 2) * 3.4 * z;
      const fx = Math.cos(k.dir) * 4 * z, fy = Math.sin(k.dir) * 4 * z;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const sgn of [-1, 1]) {
        const gx = ex + fx + px * sgn, gy = ey + fy + py * sgn;
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 7 * z);
        gr.addColorStop(0, hexA(eyeCol, a));
        gr.addColorStop(1, hexA(eyeCol, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(gx, gy, 7 * z, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // sens du boucher : silhouette du survivant
    if (vp.role === "killer" && k.senseT > 0 && s.hidden < 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 9);
      const ex = toX(s.x), ey = toY(s.y);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k.senseT) * (0.35 + pulse * 0.4);
      ctx.strokeStyle = "#ff2b3f";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, 16 * z, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,43,63,0.3)";
      ctx.beginPath(); ctx.arc(ex, ey, 10 * z, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // aveuglement du boucher par la fusée
    if (vp.role === "killer") {
      let nd = Infinity;
      for (const fl of eng.flares) nd = Math.min(nd, dist2(k.x, k.y, fl.x, fl.y));
      if (nd < 165 * 165) {
        const a = (1 - Math.sqrt(nd) / 165) * (0.75 + 0.15 * Math.sin(this.t * 23));
        ctx.fillStyle = `rgba(255,235,215,${clamp(a, 0, 0.9)})`;
        ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      }
    }
    // lueurs-guides (survivant)
    if (vp.role === "survivor" && s.hidden < 0 && s.alive) {
      const target = eng.nearestFuse();
      if (target && dist2(s.x, s.y, target.x, target.y) > 260 * 260) {
        const ang = Math.atan2(target.y - s.y, target.x - s.x);
        const col = eng.gateOpen ? "93,255,157" : "255,179,71";
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const rr = (30 + i * 11 + Math.sin(this.t * 3 + i) * 3) * z;
          const wx = toX(s.x) + Math.cos(ang) * rr, wy = toY(s.y) + Math.sin(ang) * rr;
          ctx.globalAlpha = 0.3 - i * 0.08 + Math.sin(this.t * 4 + i * 2) * 0.08;
          ctx.fillStyle = `rgba(${col},1)`;
          ctx.beginPath(); ctx.arc(wx, wy, (2.4 - i * 0.5) * z, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    for (const r of eng.rings) {
      const rr = lerp(r.r, r.max, r.t / 0.9) * z;
      ctx.save();
      ctx.globalAlpha = 1 - r.t / 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(toX(r.x), toY(r.y), rr, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const p of eng.popups) {
      const a = p.t < 0.15 ? p.t / 0.15 : 1 - Math.max(0, (p.t - 0.6) / 0.55);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = `700 ${14 * z}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#000";
      ctx.fillText(p.text, toX(p.x) + 1, toY(p.y) - p.t * 34 * z + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, toX(p.x), toY(p.y) - p.t * 34 * z);
      ctx.restore();
    }

    ctx.drawImage(this.vignette(Math.round(vp.w), Math.round(vp.h)), vp.x, vp.y);
    const danger = vp.role === "survivor" ? eng.danger : eng.danger * 0.3;
    if (danger > 0.03) {
      const pulse = Math.pow(Math.max(0, Math.sin(this.t * (1.4 + danger * 3.4) * Math.PI * 2)), 3);
      const a = danger * (0.14 + pulse * 0.3);
      const gr = ctx.createRadialGradient(vp.x + vp.w / 2, vp.y + vp.h / 2, Math.min(vp.w, vp.h) * 0.28,
        vp.x + vp.w / 2, vp.y + vp.h / 2, Math.max(vp.w, vp.h) * 0.7);
      gr.addColorStop(0, "rgba(120,8,18,0)");
      gr.addColorStop(1, `rgba(150,10,22,${a.toFixed(3)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    }
    if (eng.phase !== "run" && eng.endReason === "escaped") {
      ctx.fillStyle = `rgba(190,255,215,${clamp(eng.endT / 1.4, 0, 0.85)})`;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    }

    for (const st of eng.stingers) {
      const inT = clamp((st.max - st.t) / 0.14, 0, 1);
      const outT = clamp(st.t / 0.4, 0, 1);
      const a = Math.min(inT, outT);
      const scale = 0.8 + inT * 0.2;
      const size = (small ? 19 : 30) * scale;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = `700 ${size}px ${FONT}`;
      const sx = vp.x + vp.w / 2, sy = vp.y + vp.h * 0.3;
      if (st.color === "#ff2b3f") {
        ctx.fillStyle = "rgba(80,160,255,0.35)";
        ctx.fillText(st.text, sx - 2, sy);
        ctx.fillStyle = "rgba(255,43,63,0.4)";
        ctx.fillText(st.text, sx + 2, sy);
      }
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(st.text, sx + 2, sy + 2);
      ctx.fillStyle = st.color;
      ctx.fillText(st.text, sx, sy);
      if (st.sub) {
        ctx.font = `${(small ? 10 : 14) * scale}px ${FONT}`;
        ctx.fillStyle = "rgba(217,210,192,0.75)";
        ctx.fillText(st.sub, sx, sy + size * 0.9);
      }
      ctx.restore();
    }

    if (eng.introT > 0) {
      const a = clamp(eng.introT / 0.5, 0, 1);
      const bh = (small ? 26 : 46) * a;
      ctx.fillStyle = "#000";
      ctx.fillRect(vp.x, vp.y, vp.w, bh);
      ctx.fillRect(vp.x, vp.y + vp.h - bh, vp.w, bh);
      if (a > 0.4) {
        ctx.save();
        ctx.globalAlpha = a * 0.8;
        ctx.font = `${small ? 9 : 12}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#8a94a0";
        ctx.fillText(`${m.name} · 3H07`, vp.x + vp.w / 2, vp.y + bh + (small ? 12 : 18));
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private lighting(eng: Engine, vp: Viewport, z: number, camX: number, camY: number,
    toX: (x: number) => number, toY: (y: number) => number) {
    const lc = this.lightCtx;
    const lw = Math.max(2, Math.round(vp.w)), lh = Math.max(2, Math.round(vp.h));
    if (this.light.width !== lw || this.light.height !== lh) {
      this.light.width = lw; this.light.height = lh;
    }
    const m = eng.map;
    const owner = vp.role === "survivor" ? eng.survivor : eng.killer;
    const lx = (wx: number) => (wx - camX) * z + vp.w / 2;
    const ly = (wy: number) => (wy - camY) * z + vp.h / 2;

    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = vp.role === "survivor" ? "rgba(1,2,6,0.968)" : "rgba(2,2,7,0.945)";
    lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = "destination-out";

    const cutPoly = (pts: number[], ox: number, oy: number, radius: number, alpha: number) => {
      const gr = lc.createRadialGradient(ox, oy, 0, ox, oy, radius * z);
      gr.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gr.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.8})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      lc.fillStyle = gr;
      lc.beginPath();
      lc.moveTo(ox, oy);
      for (let i = 0; i < pts.length; i += 2) lc.lineTo(lx(pts[i]), ly(pts[i + 1]));
      lc.closePath();
      lc.fill();
    };
    const cutCircle = (wx: number, wy: number, r: number, alpha: number) => {
      const x = lx(wx), y = ly(wy);
      if (x < -r * z || y < -r * z || x > lw + r * z || y > lh + r * z) return;
      const gr = lc.createRadialGradient(x, y, 0, x, y, r * z);
      gr.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      lc.fillStyle = gr;
      lc.beginPath(); lc.arc(x, y, r * z, 0, Math.PI * 2); lc.fill();
    };

    const ambR = vp.role === "survivor" ? 125 : 150;
    const ambPts = m.castFan(owner.x, owner.y, 0, Math.PI * 2, ambR, 20);
    cutPoly(ambPts, lx(owner.x), ly(owner.y), ambR, 0.85);

    const flick = 1 - eng.danger * 0.3 * Math.max(0, Math.sin(this.t * 31) * Math.sin(this.t * 17));
    const sway = Math.sin(this.t * 1.8) * 0.05 + Math.sin(this.t * 4.3) * 0.02;
    const coneR = (vp.role === "survivor" ? 335 : 265) * flick;
    const fov = vp.role === "survivor" ? 1.15 : 0.95;
    const conePts = m.castFan(owner.x, owner.y, owner.dir + sway, fov, coneR, 26);
    cutPoly(conePts, lx(owner.x), ly(owner.y), coneR, 0.95);

    for (const f of eng.fuses)
      if (!f.taken) cutCircle(f.x, f.y, 52 + Math.sin(this.t * 3 + f.seed) * 8, 0.5);
    for (const w of eng.weapons)
      if (!w.taken) cutCircle(w.x, w.y, 42 + Math.sin(this.t * 4 + w.seed) * 6, 0.42);
    for (const l of m.lamps) {
      let fl = 0.5 + 0.3 * Math.sin(this.t * 2.3 + l.seed) + 0.2 * Math.sin(this.t * 7.7 + l.seed * 2);
      if (Math.sin(this.t * 13 + l.seed * 5) > 0.985) fl = 0.06;
      cutCircle(l.x, l.y, 150, clamp(fl, 0.05, 0.85) * 0.6);
    }
    for (const mt of m.moonTiles) cutCircle(mt.x * TILE + TILE / 2 + 14, mt.y * TILE + 56, 95, 0.3);
    for (const fl of eng.flares) {
      const ff = 0.85 + 0.15 * Math.sin(this.t * 21 + fl.seed);
      cutCircle(fl.x, fl.y, 215 * ff * Math.min(1, fl.t / 0.8), 0.92);
    }
    const ex = m.exit;
    cutCircle(ex.x, ex.y - 10, this.gateAnim > 0.5 ? 190 : 65, this.gateAnim > 0.5 ? 0.85 : 0.45);
    for (const r of eng.rings) cutCircle(r.x, r.y, lerp(r.r, r.max, r.t / 0.9), (1 - r.t / 0.9) * 0.4);

    this.ctx.drawImage(this.light, vp.x, vp.y);

    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = vp.role === "survivor" ? 0.05 : 0.035;
    const tint = ctx.createRadialGradient(toX(owner.x), toY(owner.y), 0, toX(owner.x), toY(owner.y), coneR * z);
    tint.addColorStop(0, vp.role === "survivor" ? lampColor(eng.cosmetics.lamp) : "#ff6a5a");
    tint.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(toX(owner.x), toY(owner.y));
    for (let i = 0; i < conePts.length; i += 2) ctx.lineTo(toX(conePts[i]), toY(conePts[i + 1]));
    ctx.closePath();
    ctx.fill();
    for (const f of eng.fuses) {
      if (f.taken) continue;
      const gx = toX(f.x), gy = toY(f.y);
      if (gx < vp.x - 60 || gx > vp.x + vp.w + 60 || gy < vp.y - 60 || gy > vp.y + vp.h + 60) continue;
      ctx.globalAlpha = 0.22 + Math.sin(this.t * 3 + f.seed) * 0.08;
      const fg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 26 * z);
      fg.addColorStop(0, "#ffb347"); fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(gx, gy, 26 * z, 0, Math.PI * 2); ctx.fill();
    }
    for (const w of eng.weapons) {
      if (w.taken) continue;
      const gx = toX(w.x), gy = toY(w.y);
      if (gx < vp.x - 60 || gx > vp.x + vp.w + 60 || gy < vp.y - 60 || gy > vp.y + vp.h + 60) continue;
      ctx.globalAlpha = 0.2 + Math.sin(this.t * 4 + w.seed) * 0.08;
      const wg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 22 * z);
      wg.addColorStop(0, w.kind === "taser" ? "#9fd8ff" : "#ff5a3c");
      wg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(gx, gy, 22 * z, 0, Math.PI * 2); ctx.fill();
    }
    // ampoules des lampes
    for (const l of m.lamps) {
      let fl = 0.5 + 0.3 * Math.sin(this.t * 2.3 + l.seed) + 0.2 * Math.sin(this.t * 7.7 + l.seed * 2);
      if (Math.sin(this.t * 13 + l.seed * 5) > 0.985) fl = 0.06;
      ctx.globalAlpha = clamp(fl, 0.05, 0.85) * 0.5;
      ctx.fillStyle = "#ffe9b8";
      ctx.beginPath(); ctx.arc(toX(l.x), toY(l.y), 2.6 * z, 0, Math.PI * 2); ctx.fill();
    }
    // halo des fusées
    for (const fl of eng.flares) {
      const gx = toX(fl.x), gy = toY(fl.y);
      const ff = 0.8 + 0.2 * Math.sin(this.t * 21 + fl.seed);
      ctx.globalAlpha = 0.3 * ff * Math.min(1, fl.t / 0.8);
      const fg2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, 170 * z);
      fg2.addColorStop(0, "#ff7a4c"); fg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg2;
      ctx.beginPath(); ctx.arc(gx, gy, 170 * z, 0, Math.PI * 2); ctx.fill();
    }
    if (this.gateAnim > 0.1) {
      const gx = toX(ex.x), gy = toY(ex.y);
      ctx.globalAlpha = this.gateAnim * 0.2;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 150 * z);
      gg.addColorStop(0, "#5dff9d"); gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(gx, gy, 150 * z, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawFuse(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(0, 6, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2b2f33";
    ctx.fillRect(-8, -12, 16, 20);
    ctx.fillStyle = "#1a1d20";
    ctx.fillRect(-6, -10, 12, 16);
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 3 + seed);
    ctx.fillStyle = `rgba(255,179,71,${pulse})`;
    ctx.beginPath(); ctx.arc(0, -2, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,230,180,${pulse * 0.9})`;
    ctx.beginPath(); ctx.arc(0, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4a4f55"; ctx.lineWidth = 1.5;
    ctx.strokeRect(-8, -12, 16, 20);
    ctx.restore();
  }

  private drawWeapon(ctx: CanvasRenderingContext2D, x: number, y: number, kind: string, seed: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(0, 6, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (kind === "taser") {
      ctx.rotate(-0.4);
      ctx.fillStyle = "#2e3a44"; ctx.fillRect(-9, -4, 15, 8);
      ctx.fillStyle = "#1c242b"; ctx.fillRect(-9, 0, 7, 8);
      ctx.fillStyle = "#8fa2b0"; ctx.fillRect(6, -3.5, 5, 2.4); ctx.fillRect(6, 1.1, 5, 2.4);
      const arc = 0.5 + 0.5 * Math.sin(this.t * 17 + seed);
      ctx.strokeStyle = `rgba(159,216,255,${arc})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(11, -2.3); ctx.lineTo(13.5, 0); ctx.lineTo(11, 2.3); ctx.stroke();
    } else {
      ctx.rotate(0.5);
      ctx.fillStyle = "#8a1f1a"; ctx.fillRect(-3.5, -9, 7, 18);
      ctx.fillStyle = "#c2372c"; ctx.fillRect(-3.5, -9, 7, 5);
      ctx.fillStyle = "#3a3f45"; ctx.fillRect(-3.5, 7, 7, 3);
      const sp = Math.sin(this.t * 9 + seed);
      if (sp > 0.86) {
        ctx.fillStyle = "rgba(255,200,150,0.9)";
        ctx.beginPath(); ctx.arc(0, -11, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawFlareCore(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#5d1712";
    ctx.fillRect(-3, -7, 6, 14);
    const ff = 0.75 + 0.25 * Math.sin(this.t * 23 + seed);
    ctx.fillStyle = `rgba(255,120,70,${ff})`;
    ctx.beginPath(); ctx.arc(0, -8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,240,220,${ff})`;
    ctx.beginPath(); ctx.arc(0, -8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawLocker(ctx: CanvasRenderingContext2D, eng: Engine, i: number) {
    const l = eng.lockers[i];
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(0, 12, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#39424c";
    ctx.fillRect(-16, -22, 32, 42);
    ctx.fillStyle = "#242b33";
    ctx.fillRect(-13, -19, 26, 36);
    if (l.open) {
      ctx.fillStyle = "#0b0e12";
      ctx.fillRect(-13, -19, 26, 36);
      ctx.save();
      ctx.translate(-16, -22);
      ctx.rotate(-0.9);
      ctx.fillStyle = "#39424c";
      ctx.fillRect(0, 0, 6, 42);
      ctx.restore();
    } else {
      ctx.fillStyle = "#39424c";
      ctx.fillRect(-13, -19, 26, 36);
      ctx.fillStyle = "#1c2229";
      for (let v = 0; v < 3; v++) ctx.fillRect(-8, -13 + v * 6, 16, 2);
      ctx.fillStyle = "#59646e";
      ctx.fillRect(8, 0, 3, 7);
      if (eng.survivor.hidden === i) {
        const br = 0.5 + 0.5 * Math.sin(this.t * 2.2);
        ctx.fillStyle = `rgba(217,210,192,${0.25 + br * 0.3})`;
        ctx.fillRect(-6, -12, 3, 1.6);
        ctx.fillRect(2, -12, 3, 1.6);
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeRect(-16, -22, 32, 42);
    ctx.restore();
  }

  private drawGate(ctx: CanvasRenderingContext2D, eng: Engine) {
    const e = eng.map.exit;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = "#14181d";
    ctx.fillRect(-52, -14, 104, 30);
    const open = this.gateAnim * 26;
    ctx.fillStyle = "#2e3740";
    ctx.fillRect(-46 - open, -10, 44, 22);
    ctx.fillRect(2 + open, -10, 44, 22);
    ctx.strokeStyle = "#0a0d10"; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.strokeRect(-46 - open + i * 11, -10, 11, 22);
      ctx.strokeRect(2 + open + i * 11, -10, 11, 22);
    }
    if (this.gateAnim > 0.15) {
      ctx.fillStyle = `rgba(120,255,170,${this.gateAnim * 0.35})`;
      ctx.fillRect(-open, -10, open * 2, 22);
    }
    ctx.fillStyle = eng.gateOpen ? "#5dff9d" : "#ff2b3f";
    ctx.beginPath(); ctx.arc(0, -20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1f24";
    ctx.fillRect(-56, -16, 8, 34);
    ctx.fillRect(48, -16, 8, 34);
    ctx.restore();
  }

  private drawSurvivor(ctx: CanvasRenderingContext2D, eng: Engine) {
    const s = eng.survivor;
    if (s.hidden >= 0) return;
    drawSurvivorSprite(ctx, s.x, s.y, {
      dir: s.dir, bob: s.bob, moving: s.moving, alive: s.alive, sprinting: s.sprinting,
      deathT: s.deathT, look: lookSurvivor(eng.cosmetics.survivor), lamp: lampColor(eng.cosmetics.lamp),
    });
  }

  private drawKiller(ctx: CanvasRenderingContext2D, eng: Engine) {
    const k = eng.killer;
    drawKillerSprite(ctx, k.x, k.y, {
      dir: k.dir, moving: k.moving, attackAnim: k.attackAnim, twitch: k.twitch,
      breathT: this.t, look: lookKiller(eng.cosmetics.killer),
    });
  }
}
