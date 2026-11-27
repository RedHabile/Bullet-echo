"use client";

import { useEffect, useRef } from "react";
import { paintShipAt } from "@/game/render";
import type { Skin } from "@/game/skins";

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Live, self-contained render of a ship skin (used in the hangar and armory). */
export default function ShipPreview({ skin, size = 200, spin = true }: { skin: Skin; size?: number; spin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const s = size / 220;
    const c = size / 2;
    const t0 = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Spotlight behind the hull.
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(c, c, 0, c, c, size * 0.42);
      halo.addColorStop(0, rgba(skin.color, 0.28));
      halo.addColorStop(1, rgba(skin.color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";

      // Orbit ring with a slow dash flow.
      ctx.strokeStyle = rgba(skin.color, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const rot = spin ? Math.sin(t * 0.9) * 0.45 : 0;
      const bob = spin ? Math.sin(t * 1.7) * 3 * s : 0;
      paintShipAt(ctx, skin, c, c + bob, rot, 2.5 * s, 0);

      if (spin) raf = requestAnimationFrame(draw);
    };

    if (spin) {
      raf = requestAnimationFrame(draw);
    } else {
      draw(t0);
    }
    return () => cancelAnimationFrame(raf);
  }, [skin, size, spin]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-label={`${skin.name} preview`} />;
}
