"use client";

import { useEffect, useRef } from "react";

/**
 * Money under the seal. A hidden layer of engraved dollar bills (line art in
 * the spirit of the courier etching) sits behind the hero. Only on hover, the
 * cursor reveals them through a soft lens with a faint green tint at its centre;
 * they seal back when the cursor leaves. On load the lens sweeps across once, so
 * visitors on touch screens, or who never hover, still see what is under the
 * seal. Drawn once to an offscreen layer and masked per frame. Off under
 * reduced motion.
 */

const RADIUS = 230;
const INTRO_MS = 3200;
const INTRO_DELAY_MS = 700;

// Deterministic hash (stable layout, no Math.random).
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** One engraved banknote, centred at 0,0. */
function drawBill(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  denom: string,
  ink: string,
) {
  const r = 7;
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = 1;

  // outer edge + inner frame
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, r);
  c.stroke();
  c.beginPath();
  c.roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, r - 3);
  c.stroke();

  // guilloche band: interlaced sine waves across the note
  c.save();
  c.beginPath();
  c.roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, r - 3);
  c.clip();
  c.lineWidth = 0.6;
  for (let k = 0; k < 9; k++) {
    c.beginPath();
    for (let x = -w / 2; x <= w / 2; x += 3) {
      const y = Math.sin(x / 9 + k * 0.7) * (h * 0.12) + (k - 4) * (h / 10);
      if (x === -w / 2) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.globalAlpha = 0.45;
    c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();

  // central oval medallion with a rosette and the sign
  const ow = h * 0.62;
  const oh = h * 0.72;
  c.beginPath();
  c.ellipse(0, 0, ow / 2, oh / 2, 0, 0, Math.PI * 2);
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.fill();
  c.restore();
  c.stroke();
  c.beginPath();
  c.ellipse(0, 0, ow / 2 - 4, oh / 2 - 4, 0, 0, Math.PI * 2);
  c.lineWidth = 0.6;
  c.stroke();
  c.lineWidth = 0.5;
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    c.beginPath();
    c.ellipse(Math.cos(t) * 5, Math.sin(t) * 5, ow / 4, oh / 4, t, 0, Math.PI * 2);
    c.globalAlpha = 0.35;
    c.stroke();
  }
  c.globalAlpha = 1;
  c.font = `300 ${Math.round(h * 0.34)}px Aeonik, system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("$", 0, 1);

  // corner denominations
  c.font = `400 ${Math.round(h * 0.17)}px Aeonik, system-ui, sans-serif`;
  c.textAlign = "left";
  c.fillText(denom, -w / 2 + 13, -h / 2 + 18);
  c.textAlign = "right";
  c.fillText(denom, w / 2 - 13, h / 2 - 16);

  // side seals: small hatched circles
  for (const sx of [-1, 1]) {
    const cx = sx * (w * 0.31);
    c.beginPath();
    c.arc(cx, 2, h * 0.17, 0, Math.PI * 2);
    c.lineWidth = 0.8;
    c.stroke();
    c.lineWidth = 0.4;
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.moveTo(cx - h * 0.15, 2 + i * 3.2);
      c.lineTo(cx + h * 0.15, 2 + i * 3.2);
      c.globalAlpha = 0.6;
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  // serial line
  c.font = `400 ${Math.round(h * 0.1)}px Aeonik, system-ui, sans-serif`;
  c.textAlign = "right";
  c.fillText("GL 0429 7713", w / 2 - 13, -h / 2 + 18);
}

/** An engraved coin with a reeded edge and the token mark in the middle. */
function drawCoin(
  c: CanvasRenderingContext2D,
  r: number,
  ink: string,
  logo: HTMLImageElement | "eth" | null,
) {
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = 1;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.fill();
  c.restore();
  c.stroke();
  // reeded edge
  c.lineWidth = 0.6;
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(t) * (r - 1), Math.sin(t) * (r - 1));
    c.lineTo(Math.cos(t) * (r - 5), Math.sin(t) * (r - 5));
    c.globalAlpha = 0.7;
    c.stroke();
  }
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(0, 0, r - 8, 0, Math.PI * 2);
  c.lineWidth = 0.8;
  c.stroke();
  if (logo === "eth") {
    const s2 = r * 0.5;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -s2);
    c.lineTo(s2 * 0.62, s2 * 0.05);
    c.lineTo(0, s2 * 0.36);
    c.lineTo(-s2 * 0.62, s2 * 0.05);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(0, s2 * 0.5);
    c.lineTo(s2 * 0.62, s2 * 0.16);
    c.lineTo(0, s2);
    c.lineTo(-s2 * 0.62, s2 * 0.16);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(0, -s2);
    c.lineTo(0, s2 * 0.36);
    c.globalAlpha = 0.5;
    c.stroke();
    c.globalAlpha = 1;
  } else if (logo && logo.complete && logo.naturalWidth > 0) {
    const d = (r - 11) * 2;
    c.save();
    c.beginPath();
    c.arc(0, 0, d / 2, 0, Math.PI * 2);
    c.clip();
    c.filter = "grayscale(1) contrast(1.15)";
    c.drawImage(logo, -d / 2, -d / 2, d, d);
    c.restore();
  }
}

export function CursorReveal({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loadImg = (src: string) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img;
    };
    const logos = [loadImg("/brand/logos/usdg.png"), loadImg("/brand/logos/pathusd.svg")];

    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d");
    if (!lctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let green = "46,125,83";
    const target = { x: -9999, y: -9999 };
    const pos = { x: -9999, y: -9999 };
    let strength = 0;
    let inside = false;
    let raf = 0;
    let running = false;
    // One sweep across the hero on load; the cursor takes over if it arrives.
    let intro = false;
    let introStart = 0;
    let introTimer = 0;

    const paintLayer = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      const ink = dark ? "rgba(244,245,246,1)" : "rgba(11,12,14,1)";
      green = dark ? "143,211,173" : "46,125,83";
      layer.width = Math.round(w * dpr);
      layer.height = Math.round(h * dpr);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);
      const bw = 210;
      const bh = 92;
      const stepX = 250;
      const stepY = 150;
      const denoms = ["100", "50", "20", "100", "10", "100"];
      for (let gy = -1; gy * stepY < h + stepY; gy++) {
        for (let gx = -1; gx * stepX < w + stepX; gx++) {
          const s = hash(gx, gy);
          const x = gx * stepX + (gy % 2 ? stepX / 2 : 0) + (s - 0.5) * 40;
          const y = gy * stepY + (hash(gy, gx) - 0.5) * 30;
          lctx.save();
          lctx.translate(x, y);
          if (s < 0.58) {
            lctx.rotate((s - 0.3) * 0.9);
            drawBill(lctx, bw, bh, denoms[Math.floor(s * 10) % denoms.length]!, ink);
          } else {
            // a little stack of coins: USDG, PathUSD, ETH
            const kinds: (HTMLImageElement | "eth")[] = [logos[0]!, logos[1]!, "eth"];
            const n = 2 + Math.floor(hash(gx * 3, gy * 5) * 2);
            for (let k = 0; k < n; k++) {
              const pick = kinds[Math.floor(hash(gx + k * 11, gy - k * 7) * kinds.length)]!;
              lctx.save();
              lctx.translate((k - (n - 1) / 2) * 62 + (hash(k, gx) - 0.5) * 14, (hash(gy, k) - 0.5) * 34);
              drawCoin(lctx, 30 + Math.floor(hash(k, gy) * 6), ink, pick);
              lctx.restore();
            }
          }
          lctx.restore();
        }
      }
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      paintLayer();
    };

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (strength < 0.01) return;
      const px = pos.x * dpr;
      const py = pos.y * dpr;
      const R = RADIUS * dpr;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(layer, 0, 0);
      // lens mask: only the area around the cursor survives
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, `rgba(0,0,0,${0.3 * strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${0.16 * strength})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // faint green tint at the centre of the lens
      const t = ctx.createRadialGradient(px, py, 0, px, py, R * 0.5);
      t.addColorStop(0, `rgba(${green},0.9)`);
      t.addColorStop(1, `rgba(${green},0)`);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = t;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      let showing = inside;
      if (intro && !inside) {
        if (!introStart) introStart = now;
        const t = (now - introStart) / INTRO_MS;
        if (t >= 1) {
          intro = false;
        } else {
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          target.x = w * (0.18 + 0.66 * e);
          target.y = h * (0.42 - 0.14 * Math.sin(Math.PI * t));
          if (pos.x < -999) {
            pos.x = target.x;
            pos.y = target.y;
          }
          showing = t < 0.8;
        }
      }
      pos.x += (target.x - pos.x) * 0.14;
      pos.y += (target.y - pos.y) * 0.14;
      strength += ((showing ? 1 : 0) - strength) * 0.08;
      draw();
      if (inside || intro || strength > 0.01) {
        raf = requestAnimationFrame(loop);
      } else {
        running = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      intro = false;
      const r = host.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      if (!inside) {
        inside = true;
        if (pos.x < -999) {
          pos.x = target.x;
          pos.y = target.y;
        }
      }
      start();
    };
    const onLeave = () => {
      inside = false;
      start();
    };

    resize();
    // Repaint once the brand font is ready so the numerals use Aeonik.
    void document.fonts?.ready.then(paintLayer);
    logos.forEach((img) => img.addEventListener("load", paintLayer, { once: true }));
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const mo = new MutationObserver(paintLayer);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (fine) {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
    }
    introTimer = window.setTimeout(() => {
      if (inside) return;
      intro = true;
      start();
    }, INTRO_DELAY_MS);

    return () => {
      window.clearTimeout(introTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
    />
  );
}
