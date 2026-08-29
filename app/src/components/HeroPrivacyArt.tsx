"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

/** Hero side plate: lime ink figure, no gimmick overlays. */
export function HeroPrivacyArt() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-line bg-black"
      whileHover={reduce ? undefined : { scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
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
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent"
        aria-hidden
      />
      <span className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-lime backdrop-blur-sm">
        What the chain cannot see
      </span>
    </motion.div>
  );
}
