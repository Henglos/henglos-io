'use client';
import { MotionConfig, motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

// The landing's motion basics. MotionConfig "user": with the OS's "reduce
// motion" on, transforms are skipped and things simply appear.

export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fades and rises into place the first time it scrolls into view. */
export function Reveal({
  delay = 0,
  y = 24,
  children,
  ...props
}: { delay?: number; y?: number; children: ReactNode } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
