'use client';
import { useEffect, useState, type MouseEvent } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import { ArrowRight, ArrowUpRight, BookOpen, Mail } from 'lucide-react';
import { SURVEY_URL } from '@/lib/links';
import { ButtonLink } from './button-link';
import { WorkflowPreview } from '../workflow-preview';
import { CanvasBackground } from './canvas-background';
import { StudioWindow } from './studio-window';

const WORDS = ['sensors', 'motors', 'LEDs', 'relays', 'displays'];

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Hero() {
  // A soft light that follows the pointer across the hero.
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 150, damping: 25 });
  const sy = useSpring(y, { stiffness: 150, damping: 25 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${sx}px ${sy}px, var(--accent-subtle), transparent 70%)`;

  const onMove = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  return (
    // Its own section of the page: the canvas' dot grid, the workflow floating on it.
    <section onMouseMove={onMove} className="relative overflow-hidden border-b border-line-subtle">
      <CanvasBackground />
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />

      {/* drifting glows */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[10%] top-24 size-[420px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--accent-subtle), transparent)' }}
        animate={{ x: [0, 80, -40, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-64 size-[360px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--info-subtle), transparent)' }}
        animate={{ x: [0, -60, 30, 0], y: [0, 50, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28"
      >
 

        <motion.h1
          variants={item}
          className="max-w-4xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-6xl"
        >
          Program your <RotatingWord /> <br className="hidden sm:block" />
          as a <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">flow</span>
        </motion.h1>

        <motion.p variants={item} className="mt-6 max-w-2xl text-pretty text-base text-fg-secondary sm:text-lg">
          Wire sensors, actuators and logic on a visual canvas, run it on the real board through a driver on your
          machine, and step through it action by action — with every value on screen.
        </motion.p>

        <motion.div variants={item} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/docs/getting-started" primary>
            Get started <ArrowRight className="size-4" />
          </ButtonLink>
          <ButtonLink href="/docs">
            <BookOpen className="size-4" /> Read the docs
          </ButtonLink>
        </motion.div>

        <motion.a
          variants={item}
          href={SURVEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-6 inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <Mail className="size-4 text-accent" />
          Get early access and news — take a 2-minute survey
          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </motion.a>
      </motion.div>

      {/* The canvas tilts up into place — almost the page's width, out of the text's column. */}
      <motion.div
        initial={{ opacity: 0, y: 80, rotateX: 22, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 1.1, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformPerspective: 1400 }}
        className="relative mx-auto -mt-4 w-full max-w-[1280px] px-4 pb-28 text-left sm:px-8"
      >
        {/* The studio's own canvas (@henglosio/workflow-ui), a debug session playing through a real workflow. */}
        <StudioWindow title="Water alarm" debugging>
          <WorkflowPreview
            name="water-alarm"
            debug
            height="clamp(420px, 46vw, 620px)"
            className="my-0! rounded-none! border-0!"
          />
        </StudioWindow>
      </motion.div>
    </section>
  );
}

// "sensors" → "motors" → "LEDs"… one word sliding out as the next slides in.
function RotatingWord() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2200);
    return () => clearInterval(timer);
  }, [reduce]);

  return (
    <motion.span layout className="relative inline-flex overflow-hidden align-bottom text-accent">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={WORDS[index]}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
