"use client";

import Image from "next/image";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Hero side plate: on hover, the image "tears" then stitches closed again —
 * private surface under a public gash.
 */
export function HeroPrivacyArt() {
  const reduce = useReducedMotion();

  return (
    <div
      className={`group relative aspect-[4/5] overflow-hidden rounded-lg border border-line bg-black ${
        reduce ? "" : "hero-privacy"
      }`}
    >
      <Image
        src="/ascii/IMG_1476.PNG"
        alt="Private figure"
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 40vw"
        className="ascii-ink object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
      />
      <div
        className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-70"
        style={{ backgroundColor: "#c8ff00" }}
        aria-hidden
      />

      {/* Tear planes */}
      {!reduce && (
        <>
          <div className="hero-tear hero-tear-a" aria-hidden />
          <div className="hero-tear hero-tear-b" aria-hidden />
          <div className="hero-stitch" aria-hidden />
        </>
      )}

      <p className="pointer-events-none absolute bottom-4 left-4 right-4 font-mono text-[10px] uppercase tracking-[0.16em] text-black/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        Tear open. Stitch shut. Stay private.
      </p>
    </div>
  );
}
