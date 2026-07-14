"use client";

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export function useMotionSafe() {
  const reduce = useReducedMotion();
  return !reduce;
}

/** Subtle entrance — never leave long opacity-0 voids on scroll. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease } },
};

export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

/**
 * Section wrapper. Intentionally a plain <section> so its content is never
 * hidden waiting on a variant that might not propagate — children reveal
 * themselves independently via MotionItem / MotionCard.
 */
export function MotionSection({
  children,
  className = "",
  delay: _delay = 0,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
} & HTMLMotionProps<"section">) {
  return (
    <section className={className} {...(rest as HTMLMotionProps<"section">)}>
      {children}
    </section>
  );
}

const viewport = { once: true, amount: 0.2, margin: "0px 0px -60px 0px" } as const;

export function MotionItem({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li" | "p" | "h1" | "h2" | "h3";
}) {
  const animate = useMotionSafe();
  const Comp = motion[as];
  if (!animate) {
    return <Comp className={className}>{children}</Comp>;
  }
  return (
    <Comp
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    >
      {children}
    </Comp>
  );
}

export function MotionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const animate = useMotionSafe();
  if (!animate) {
    return <article className={className}>{children}</article>;
  }
  return (
    <motion.article
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      whileHover={{ y: -3, transition: { duration: 0.2, ease } }}
      whileTap={{ scale: 0.99 }}
    >
      {children}
    </motion.article>
  );
}

export function MotionPress({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const animate = useMotionSafe();
  return (
    <motion.div
      className={className}
      whileHover={animate ? { scale: 1.02 } : undefined}
      whileTap={animate ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}
