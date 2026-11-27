// ── THE HOLLOW · sprites paramétrés par skin (jeu + aperçus boutique) ───────

export interface SurvivorLook { jacket: string; hood: string; trim: string; tone: string; }
export interface KillerLook { body: string; apron: string; stain: string; eyes: string; blade: string; }

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

export function drawSurvivorSprite(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  o: { dir: number; bob: number; moving: boolean; alive: boolean; sprinting: boolean; deathT: number; look: SurvivorLook; lamp: string },
) {
  const { look } = o;
  ctx.save();
  ctx.translate(x, y);
  if (!o.alive) {
    ctx.rotate(o.dir + Math.min(1, o.deathT * 3) * 1.4);
    ctx.globalAlpha = 0.95;
  } else ctx.rotate(o.dir + (o.sprinting ? 0.06 : 0));
  const bob = Math.sin(o.bob) * (o.moving ? 1.6 : 0.4);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.ellipse(0, 3, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  if (o.alive) {
    const st = Math.sin(o.bob * 2);
    ctx.fillStyle = "#1c2126";
    ctx.beginPath(); ctx.arc(st * 5, -6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-st * 5, 6, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = o.alive ? look.jacket : "#33393f";
  ctx.beginPath(); ctx.ellipse(bob * 0.3, 0, 11, 9.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(bob * 0.3, 0, 11, 9.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = look.hood;
  ctx.beginPath(); ctx.ellipse(bob * 0.3 - 3, 0, 7, 8.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.trim; ctx.fillRect(-7, -5, 4, 10);
  if (o.alive) {
    ctx.fillStyle = look.tone;
    ctx.beginPath(); ctx.arc(8, 6, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#565e66";
    ctx.fillRect(8, 4.4, 7, 3.2);
    ctx.fillStyle = o.lamp;
    ctx.fillRect(14.4, 4.6, 1.6, 2.8);
  }
  ctx.fillStyle = look.tone;
  ctx.beginPath(); ctx.arc(2 + bob * 0.4, 0, 5.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.hood;
  ctx.beginPath(); ctx.arc(0.4 + bob * 0.4, 0, 5.8, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  ctx.restore();
}

export function drawKillerSprite(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  o: { dir: number; moving: boolean; attackAnim: number; twitch: number; breathT: number; look: KillerLook },
) {
  const { look } = o;
  ctx.save();
  const tw = o.twitch > 0 ? (Math.random() - 0.5) * 3 : 0;
  ctx.translate(x + tw, y + tw * 0.6);
  ctx.rotate(o.dir);
  const breath = 1 + 0.02 * Math.sin(o.breathT * 2.2);
  ctx.scale(breath, breath);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.ellipse(0, 3, 17, 13, 0, 0, Math.PI * 2); ctx.fill();
  const st = Math.sin(o.breathT * (o.moving ? 9 : 2));
  ctx.fillStyle = "#101318";
  ctx.beginPath(); ctx.arc(st * 6, -7, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-st * 6, 7, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.body;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 12.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 12.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = look.apron;
  ctx.beginPath(); ctx.ellipse(4, 0, 9, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hexA(look.stain, 0.7);
  ctx.beginPath(); ctx.ellipse(6, 3, 4, 5, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, -4, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
  const swing = o.attackAnim > 0 ? Math.sin(((0.24 - o.attackAnim) / 0.24) * Math.PI) * 1.5 - 0.7 : 0.35;
  ctx.save();
  ctx.translate(6, 10);
  ctx.rotate(swing);
  ctx.fillStyle = "#15181d";
  ctx.fillRect(0, -2.5, 12, 5);
  ctx.fillStyle = "#c9bfa8";
  ctx.beginPath(); ctx.arc(12, 0, 3, 0, Math.PI * 2); ctx.fill();
  const bg = ctx.createLinearGradient(14, -9, 26, 4);
  bg.addColorStop(0, "#6a747e"); bg.addColorStop(0.5, look.blade); bg.addColorStop(1, "#565e66");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(13, -2); ctx.lineTo(27, -9); ctx.lineTo(29, -1); ctx.lineTo(14, 3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = hexA(look.stain, 0.8);
  ctx.fillRect(24, -7, 4, 3);
  ctx.restore();
  ctx.fillStyle = "#b9b09b";
  ctx.beginPath(); ctx.arc(4, 0, 6.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#14171c";
  ctx.beginPath(); ctx.arc(1.4, 0, 6.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  // yeux
  ctx.fillStyle = hexA(look.eyes, 0.95);
  ctx.beginPath(); ctx.arc(7.2, -2.2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(7.2, 2.2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
