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

export function MotionSection({
  children,
  className = "",
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
} & HTMLMotionProps<"section">) {
  const animate = useMotionSafe();
  return (
    <motion.section
      className={className}
      initial={animate ? "hidden" : false}
      whileInView={animate ? "show" : undefined}
      viewport={{ once: true, amount: 0.08, margin: "0px 0px -40px 0px" }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.07, delayChildren: delay },
        },
      }}
      {...rest}
    >
      {children}
    </motion.section>
  );
}

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
  return (
    <Comp
      className={className}
      variants={animate ? fadeUp : undefined}
      initial={animate ? "hidden" : false}
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
  return (
    <motion.article
      className={className}
      variants={animate ? fadeUp : undefined}
      whileHover={
        animate
          ? { y: -3, transition: { duration: 0.2, ease } }
          : undefined
      }
      whileTap={animate ? { scale: 0.99 } : undefined}
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
