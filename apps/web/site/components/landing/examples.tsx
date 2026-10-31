'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { WorkflowPreview, type ExampleWorkflow } from '../workflow-preview';
import { StudioWindow } from './studio-window';
import { Reveal } from './motion';
import { SectionHeading } from './button-link';

type Example = {
  name: ExampleWorkflow;
  title: string;
  body: string;
  uses: string[];
};

const EXAMPLES: Example[] = [
  {
    name: 'climate',
    title: 'Climate control',
    body: 'A DHT22 read in a loop, the temperature on an OLED, and a fan at full speed past 30 °C. Pass Context carries the reading past the display to the If.',
    uses: ['DHT', 'Display', 'If', 'PWM'],
  },
  {
    name: 'web-api',
    title: 'A web API',
    body: 'Join the Wi-Fi once, then answer requests on /led: a Switch routes /on and /off to the LED and answers ok — anything else gets a 404.',
    uses: ['WiFi', 'Request Trigger', 'Switch', 'GPIO', 'Respond'],
  },
  {
    name: 'servo-sweep',
    title: 'Servo sweep',
    body: 'A Repeat sweeps a servo from 0° to 180° three times — the loop wired back into it — then fades an LED in to say it’s done.',
    uses: ['Repeat', 'Servo', 'Delay', 'PWM'],
  },
];

/** Real workflows, each playing a debug session — pick one from the tabs. */
export function Examples() {
  const [index, setIndex] = useState(0);
  const example = EXAMPLES[index]!;

  return (
    <section className="relative overflow-hidden py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Examples"
            title="Real workflows, running"
            body="Each one is built from the real packages — the nodes, settings and bindings the studio makes. Watch it step through, drag the nodes around."
          />
        </Reveal>

        <Reveal delay={0.1} className="mt-10 flex justify-center">
          <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
            {EXAMPLES.map((item, i) => (
              <button
                key={item.name}
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={clsx(
                  'relative shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  i === index ? 'text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {i === index && (
                  <motion.span layoutId="example-tab" className="absolute inset-0 rounded-lg border border-line-strong bg-raised" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
                )}
                <span className="relative">{item.title}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.15} className="mx-auto mt-10 w-full max-w-[1200px] px-4 sm:px-8">
        <StudioWindow title={example.title} debugging>
          <WorkflowPreview name={example.name} debug height="clamp(380px, 42vw, 540px)" className="my-0! rounded-none! border-0!" />
        </StudioWindow>

        <AnimatePresence mode="wait">
          <motion.div
            key={example.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-4 text-center"
          >
            <p className="text-pretty text-fg-secondary">{example.body}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {example.uses.map((use) => (
                <span key={use} className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs text-fg-muted">{use}</span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </Reveal>
    </section>
  );
}

/** One workflow beside its explanation — text on one side, the canvas on the other. */
export function Showcase({
  name,
  eyebrow,
  title,
  body,
  points,
  windowTitle,
  reverse,
}: {
  name: ExampleWorkflow;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  /** The workflow's name, in the window's title bar. */
  windowTitle: string;
  /** The canvas on the left, the text on the right. */
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-8">
      <div className={clsx('grid items-center gap-12', reverse ? 'lg:grid-cols-[1.6fr_0.8fr]' : 'lg:grid-cols-[0.8fr_1.6fr]')}>
        <Reveal className={clsx(reverse && 'lg:order-2')}>
          <SectionHeading align="left" eyebrow={eyebrow} title={title} body={body} />
          <ul className="mt-6 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-6 text-fg-secondary">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <StudioWindow title={windowTitle} debugging>
            <WorkflowPreview name={name} debug height="clamp(360px, 36vw, 500px)" className="my-0! rounded-none! border-0!" />
          </StudioWindow>
        </Reveal>
      </div>
    </section>
  );
}
