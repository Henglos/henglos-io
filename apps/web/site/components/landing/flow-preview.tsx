'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { CircleCheck, StepForward } from 'lucide-react';
import clsx from 'clsx';

// The studio's canvas in debug mode, playing on its own: Start → GPIO Read →
// Servo, one step at a time, looping back to Start — the step that ran
// marked, the next one waiting on Continue, the wire between them flowing.
// No frame: the nodes float on the page's own canvas (CanvasBackground).
// Drawn at a fixed size and scaled to its box, so the wires meet the ports.

const WIDTH = 720;
const HEIGHT = 330;
const STEP_MS = 1900;

// Where each node sits and where its ports are (y from the node's top).
const START = { x: 24, y: 132, w: 176, out: 64 };
const READ = { x: 258, y: 56, w: 204, in: 64, success: 64, fallback: 96 };
const SERVO = { x: 522, y: 150, w: 186, in: 64 };

type NodeId = 'start' | 'read' | 'servo';

// One pass of the flow: what ran, what Continue runs next, the output it ended on.
const PHASES: { ran: NodeId; next: NodeId; output: string }[] = [
  { ran: 'start', next: 'read', output: 'Start' },
  { ran: 'read', next: 'servo', output: 'Success' },
  { ran: 'servo', next: 'start', output: 'Success' },
];

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
};

const WIRES = {
  'start-read': curve(START.x + START.w, START.y + START.out, READ.x, READ.y + READ.in),
  'read-servo': curve(READ.x + READ.w, READ.y + READ.success, SERVO.x, SERVO.y + SERVO.in),
} as const;

export function FlowPreview() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tick, setTick] = useState(1);
  const inView = useInView(box, { amount: 0.3 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, node.clientWidth / WIDTH)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Plays while it's on screen; holds still with reduced motion.
  useEffect(() => {
    if (!inView || reduce) return;
    const timer = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [inView, reduce]);

  const phase = PHASES[tick % PHASES.length]!;
  const step = (tick % PHASES.length) + 1;
  // A button: pressed on every other pass. Read publishes it, the servo follows.
  const pass = Math.floor(tick / PHASES.length);
  const pressed = (phase.ran === 'start' ? pass - 1 : pass) % 2 === 0;
  // The servo still shows the last pass' angle while Read has a new value.
  const angle = (phase.ran === 'read' ? !pressed : pressed) ? '90°' : '0°';
  const activeWire = `${phase.ran}-${phase.next}` as keyof typeof WIRES;
  const flowing = activeWire in WIRES ? activeWire : null;

  const role = (id: NodeId) => (phase.ran === id ? 'ran' : phase.next === id ? 'next' : null);

  const badges = (id: NodeId) => {
    const r = role(id);
    if (r === 'ran') {
      return (
        <span className="flex items-center gap-1 rounded-md border border-accent-line bg-accent-subtle px-1.5 py-0.5 text-[11px] font-medium text-accent-fg backdrop-blur">
          <CircleCheck className="size-3" /> Step {step} <span className="opacity-70">→</span> <span className="font-mono">{phase.output}</span>
        </span>
      );
    }
    if (r === 'next') {
      return (
        <span className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent shadow-[0_2px_10px_rgb(0_0_0/0.35)]">
          <StepForward className="size-3" /> Continue <span className="opacity-70">· step {(step % PHASES.length) + 1}</span>
        </span>
      );
    }
    return null;
  };

  return (
    <div
      ref={box}
      className="relative w-full"
      style={{ height: HEIGHT * scale }}
      aria-label="The Henglos IO studio running a workflow in the debugger, one step at a time"
      role="img"
    >
      {/* drifting gently up and down */}
      <motion.div
        className="absolute inset-0"
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}>
        <svg className="absolute inset-0" width={WIDTH} height={HEIGHT} fill="none" aria-hidden="true">
          {(Object.keys(WIRES) as (keyof typeof WIRES)[]).map((key) => (
            <path
              key={key}
              d={WIRES[key]}
              stroke={flowing === key ? 'var(--accent-line)' : 'var(--wire)'}
              strokeWidth={flowing === key ? 3 : 2}
              style={{ transition: 'stroke 400ms, stroke-width 400ms' }}
            />
          ))}
          {flowing && (
            <g key={tick}>
              <path d={WIRES[flowing]} className="wire-flow" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
              {/* a pulse travelling down the wire */}
              <circle r={4} fill="var(--accent)" style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}>
                <animateMotion dur="0.9s" repeatCount="indefinite" path={WIRES[flowing]} />
              </circle>
            </g>
          )}
        </svg>

        <Node id="start" at={START} title="Start" subtitle="Core" role={role('start')} badge={badges('start')} badgeKey={tick}>
          <Row label="Mode" value="loop" />
          <Port side="right" y={START.out} active={phase.ran === 'start'} />
        </Node>

        <Node id="read" at={READ} title="Read" subtitle="GPIO" role={role('read')} badge={badges('read')} badgeKey={tick}>
          <Row label="Pin" value="GPIO 4" />
          <Row label="value" value={String(pressed)} highlight={phase.ran === 'read'} />
          <Port side="left" y={READ.in} />
          <Port side="right" y={READ.success} active={phase.ran === 'read'} />
          <Port side="right" y={READ.fallback} danger />
        </Node>

        <Node id="servo" at={SERVO} title="To angle" subtitle="Servo" role={role('servo')} badge={badges('servo')} badgeKey={tick}>
          <Row label="Pin" value="GPIO 18" />
          <Row label="Angle" value={angle} highlight={phase.ran === 'servo'} />
          <Port side="left" y={SERVO.in} />
        </Node>
      </div>
      </motion.div>
    </div>
  );
}

function Node({
  at,
  title,
  subtitle,
  role,
  badge,
  badgeKey,
  children,
}: {
  id: NodeId;
  at: { x: number; y: number; w: number };
  title: string;
  subtitle: string;
  role: 'ran' | 'next' | null;
  badge: ReactNode;
  badgeKey: number;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx('absolute transition-opacity duration-500', !role && 'opacity-45')}
      style={{ left: at.x, top: at.y, width: at.w }}
    >
      <div className="absolute bottom-full left-0 mb-1.5">
        <AnimatePresence mode="wait">
          {badge && (
            <motion.div
              key={`${badgeKey}-${role}`}
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {badge}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        animate={{ scale: role === 'ran' ? 1.02 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className={clsx(
          // Floating on the page: a soft shadow under every node.
          'relative rounded-lg border bg-raised transition-[border-color,box-shadow] duration-500',
          role === 'ran' && 'border-accent ring-2 ring-accent-subtle shadow-[0_0_28px_var(--accent-subtle),0_18px_40px_-12px_rgb(0_0_0/0.6)]',
          role === 'next' && 'border-accent border-dashed ring-2 ring-accent-subtle shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]',
          !role && 'border-line shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]',
        )}
      >
        <div className="flex h-9 items-center gap-2 border-b border-line-subtle px-3">
          <span className="font-mono text-sm text-fg">{title}</span>
          <span className="text-xs text-fg-faint">•</span>
          <span className="text-xs text-fg-muted">{subtitle}</span>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5">{children}</div>
      </motion.div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between rounded-md border px-2 py-1 text-xs transition-colors duration-500',
        highlight ? 'border-accent-line bg-accent-subtle' : 'border-line-subtle bg-field',
      )}
    >
      <span className="text-fg-muted">{label}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className={clsx('font-mono', highlight ? 'text-accent-fg' : 'text-fg')}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Port({ side, y, active, danger }: { side: 'left' | 'right'; y: number; active?: boolean; danger?: boolean }) {
  return (
    <span
      className={clsx(
        'absolute h-5 w-2 -translate-y-1/2 border border-line-subtle transition-[background-color,box-shadow] duration-500',
        side === 'left' ? '-left-2 rounded-l-xs' : '-right-2 rounded-r-xs',
        danger ? 'bg-danger' : active ? 'bg-accent shadow-[0_0_0_3px_var(--accent-subtle)]' : 'bg-port',
      )}
      style={{ top: y }}
    />
  );
}
