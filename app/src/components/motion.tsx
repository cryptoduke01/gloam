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

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.45, ease } },
};

export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
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
      viewport={{ once: true, margin: "-10% 0px -8% 0px", amount: 0.2 }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.1, delayChildren: delay },
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
          ? { y: -4, transition: { duration: 0.25, ease } }
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
