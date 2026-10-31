'use client';
import { motion, useMotionTemplate, useScroll, useTransform } from 'motion/react';

// The hero's background: the studio canvas' dot grid, filling the section it's
// in (give that section `relative`). It drifts slower than the page as you
// scroll (parallax), like a canvas being panned; the workflow floats on it.
export function CanvasBackground() {
  const { scrollY } = useScroll();
  const offset = useTransform(scrollY, (y) => -y * 0.25);
  const position = useMotionTemplate`0px ${offset}px`;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: 'radial-gradient(var(--line-strong) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        backgroundPosition: position,
      }}
    />
  );
}
