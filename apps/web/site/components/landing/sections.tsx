'use client';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Mail } from 'lucide-react';
import { ButtonLink, SectionHeading } from './button-link';
import { SURVEY_URL } from '@/lib/links';

// ── Features ──────────────────────────────────────────────────────────────

export type Feature = { icon: ReactNode; title: string; body: string };

/** Cards that come in one after another, with a light that follows the pointer inside each. */
export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {features.map((feature) => (
        <FeatureCard key={feature.title} feature={feature} />
      ))}
    </motion.div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
  };

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.97 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileHover={{ y: -4 }}
      onMouseMove={onMove}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-line bg-panel p-6 transition-colors duration-300 hover:border-accent-line"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(260px circle at var(--x) var(--y), var(--accent-subtle), transparent 70%)' }}
      />
      <span className="relative flex size-9 items-center justify-center rounded-lg border border-line bg-raised text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 [&_svg]:size-4">
        {feature.icon}
      </span>
      <h3 className="relative text-sm font-semibold text-fg">{feature.title}</h3>
      <p className="relative text-sm leading-6 text-fg-muted">{feature.body}</p>
    </motion.div>
  );
}

// ── How it works ──────────────────────────────────────────────────────────

/** `command`: `code` is typed at a terminal prompt. */
export type Step = { title: string; body: string; code: string; command?: boolean };

/** The steps, with a line that draws itself across them as the page scrolls. */
export function Steps({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const width = useTransform(progress, [0, 1], ['0%', '100%']);

  return (
    <ol ref={ref} className="relative mt-14 grid gap-6 md:grid-cols-3">
      {/* the track, and how far along it the page is */}
      <div aria-hidden="true" className="absolute left-[16.6%] right-[16.6%] top-10 z-1 hidden h-px bg-line md:block">
        <motion.div className="h-full bg-accent shadow-[0_0_12px_var(--accent)]" style={{ width }} />
      </div>
      {steps.map((step, index) => (
        <motion.li
          key={step.title}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center gap-4 rounded-xl border border-line bg-panel p-6 text-center"
        >
          <span className="relative z-10 flex size-8 items-center justify-center rounded-full border border-accent-line bg-raised font-mono text-sm text-accent-fg shadow-[0_0_0_6px_var(--panel)]">
            {index + 1}
          </span>
          <h3 className="text-base font-semibold text-fg">{step.title}</h3>
          <p className="text-sm leading-6 text-fg-muted">{step.body}</p>
          <Typewriter text={step.code} prompt={step.command} delay={index * 0.4} />
        </motion.li>
      ))}
    </ol>
  );
}

/** Types `text` out once it scrolls into view, with a blinking caret. */
function Typewriter({ text, prompt, delay = 0 }: { text: string; prompt?: boolean; delay?: number }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(text.length);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        setShown((n) => {
          if (n >= text.length) {
            clearInterval(timer);
            return n;
          }
          return n + 1;
        });
      }, 32);
    }, delay * 1000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [inView, reduce, text, delay]);

  return (
    <code
      ref={ref}
      className="mt-auto flex min-h-9 w-full items-center truncate rounded-md border border-line-subtle bg-field px-3 py-2 text-left font-mono text-xs text-fg-secondary"
    >
      {prompt && <span className="text-accent-fg">$&nbsp;</span>}
      {text.slice(0, shown)}
      <span className="ml-px inline-block h-3.5 w-1.5 animate-pulse bg-accent" />
    </code>
  );
}

// ── Code ──────────────────────────────────────────────────────────────────

/** A file whose lines come in one by one when it scrolls into view. */
export function CodeCard({ file, code, delay = 0 }: { file: string; code: string; delay?: number }) {
  const lines = code.split('\n');
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_16px_48px_-16px_rgb(0_0_0/0.5)]"
    >
      <div className="flex h-9 items-center gap-2 border-b border-line-subtle px-4">
        <span className="size-2 rounded-full bg-danger/70" />
        <span className="size-2 rounded-full bg-warning/70" />
        <span className="size-2 rounded-full bg-success/70" />
        <span className="ml-2 font-mono text-xs text-fg-muted">{file}</span>
      </div>
      <motion.pre
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        variants={{ show: { transition: { staggerChildren: 0.035, delayChildren: delay + 0.2 } } }}
        className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-fg-secondary"
      >
        {lines.map((line, index) => (
          <motion.div
            key={index}
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
            className="flex gap-4"
          >
            <span className="w-5 shrink-0 select-none text-right text-fg-faint">{index + 1}</span>
            <span className="whitespace-pre">{line || ' '}</span>
          </motion.div>
        ))}
      </motion.pre>
    </motion.div>
  );
}

// ── Call to action ────────────────────────────────────────────────────────

/** The closing panel, with a light running around its border. */
export function CallToAction() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl p-px"
      >
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, var(--accent) 50deg, transparent 110deg, transparent 360deg)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
        <div className="relative overflow-hidden rounded-[15px] bg-panel px-6 py-16 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(60% 80% at 50% 0%, var(--accent-subtle), transparent)' }}
          />
          <div className="relative flex flex-col items-center">
            <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight text-fg">
              Plug in a board. Draw the flow. Watch it run.
            </h2>
            <p className="mt-4 max-w-lg text-fg-secondary">
              Set up Henglos IO on your machine in a few minutes and run your first workflow on an ESP32.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/docs/getting-started" primary>
                Get started <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href={SURVEY_URL} external>
                <Mail className="size-4" /> Join the early access <ArrowUpRight className="size-4" />
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-fg-muted">
              A 2-minute survey — tell us what you build, and get news and early access by email.
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export { SectionHeading };
