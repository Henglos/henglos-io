'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { useDebugSimulation, WorkflowViewer, type DebugValue } from '@henglosio/workflow-ui';
import type { IWorkflowRuntime } from '@henglosio/workflow';
import clsx from 'clsx';
import buttonLed from '@/content/workflows/button-led.json';
import triggers from '@/content/workflows/triggers.json';
import waterAlarm from '@/content/workflows/water-alarm.json';
import climate from '@/content/workflows/climate.json';
import webApi from '@/content/workflows/web-api.json';
import servoSweep from '@/content/workflows/servo-sweep.json';

// The example workflows (content/workflows, built by scripts/build-example-workflows.mjs).
const workflows = {
  'button-led': buttonLed as unknown as IWorkflowRuntime,
  triggers: triggers as unknown as IWorkflowRuntime,
  'water-alarm': waterAlarm as unknown as IWorkflowRuntime,
  climate: climate as unknown as IWorkflowRuntime,
  'web-api': webApi as unknown as IWorkflowRuntime,
  'servo-sweep': servoSweep as unknown as IWorkflowRuntime,
} as const;

export type ExampleWorkflow = keyof typeof workflows;

// Per node — by its "Component › Alias" — or per visit of it in this pass
// (0 the first time), for a node the flow comes back to (a Repeat, a loop).
type PerVisit<T> = T | ((visit: number) => T);

/**
 * How a debug session plays through an example, pass after pass (`pass`
 * counts from 0, so the branches can take turns): the trigger it starts from,
 * which output a node ends on and what it publishes.
 */
type Script = (pass: number) => {
  entry?: string;
  outputs?: Record<string, PerVisit<string>>;
  values?: Record<string, PerVisit<Record<string, DebugValue>>>;
};

const at = <T,>(value: PerVisit<T> | undefined, visit: number) =>
  typeof value === 'function' ? (value as (visit: number) => T)(visit) : value;

const scripts: Partial<Record<ExampleWorkflow, Script>> = {
  'button-led': (pass) => ({
    values: { 'GPIO › Read': { value: pass % 2 === 0 }, 'GPIO › Write': { value: pass % 2 === 0 } },
  }),
  'water-alarm': (pass) => {
    const wet = pass % 2 === 0;
    return {
      entry: pass % 3 === 2 ? 'GPIO › Pin Trigger' : 'Start',
      outputs: { 'Logic › If': wet ? 'True' : 'False' },
      values: {
        'Water Sensor › Read': { level: wet ? 62.5 : 3.1, wet, raw: wet ? 24381 : 2819 },
        'Time › Delay': { duration: 1000 },
        'GPIO › Pin Trigger': { level: false, at: 48210 },
        'GPIO › Write': { value: wet },
      },
    };
  },
  triggers: (pass) => ({
    entry: ['Start', 'HTTP › Request Trigger', 'Time › Timer Trigger'][pass % 3],
    values: {
      'WiFi › Connect': { ip: '192.168.0.42', ssid: 'Home', rssi: -58 },
      'HTTP › Request Trigger': { method: 'GET', path: '/led', subpath: '', query: {} },
      'Time › Timer Trigger': { count: pass + 1 },
      'GPIO › Write': { value: true },
    },
  }),
  climate: (pass) => {
    const temperature = [27.4, 31.2, 32.8, 29.1][pass % 4]!;
    return {
      outputs: { 'Logic › If': temperature > 30 ? 'True' : 'False' },
      values: {
        'DHT › Read': { temperature, humidity: 58, heat_index: temperature + 1.3, dew_point: 18.6 },
        'Display › Print': { text: `Temp: ${temperature.toFixed(1)} C` },
        'PWM › Write': { duty: temperature > 30 ? 100 : 0, frequency: 25000 },
      },
    };
  },
  'web-api': (pass) => {
    const subpath = ['/on', '/off', '/blink'][pass % 3]!;
    return {
      entry: pass === 0 ? 'Start' : 'HTTP › Request Trigger',
      outputs: { 'Logic › Switch': subpath === '/on' ? 'Case 1' : subpath === '/off' ? 'Case 2' : 'Default' },
      values: {
        'WiFi › Connect': { ip: '192.168.0.42', ssid: 'Home', rssi: -58 },
        'HTTP › Request Trigger': { method: 'GET', path: `/led${subpath}`, subpath, segments: [subpath.slice(1)] },
        'GPIO › Write': { value: subpath === '/on' },
        'HTTP › Respond': {},
      },
    };
  },
  'servo-sweep': () => ({
    outputs: { 'Logic › Repeat': (visit) => (visit < 3 ? 'Loop' : 'Done') },
    values: {
      'Logic › Repeat': (visit) => ({ iteration: Math.min(visit + 1, 3) }),
      'Servo › To Angle': (visit) => ({ angle: visit % 2 === 0 ? 0 : 180 }),
      'Time › Delay': { duration: 600 },
      'PWM › Fade': { duty: 100 },
    },
  }),
};

const STEP_MS = 1500;

type WorkflowPreviewProps = {
  name: ExampleWorkflow;
  height?: number | string;
  /** Plays a debug session through it on its own — the studio's debug mode, step after step. */
  debug?: boolean;
  /** Clicking a node shows its details. Default true (off while it plays a debug session). */
  details?: boolean;
  /** Steps faster or slower than the default, in ms. */
  stepMs?: number;
  className?: string;
};

/**
 * A real workflow on the studio's canvas, read-only — drag the nodes around,
 * click one for its details. In MDX: <WorkflowPreview name="button-led" /> —
 * or <WorkflowPreview name="water-alarm" debug /> to watch it run.
 */
export function WorkflowPreview({ name, height = 440, debug = false, details, stepMs, className }: WorkflowPreviewProps) {
  const workflow = workflows[name];
  return (
    <div className={clsx('not-prose my-6 overflow-hidden rounded-xl border border-line', className)} style={{ height }}>
      {debug
        // Keyed by name: switching examples starts a fresh session.
        ? <DebuggingViewer key={name} workflow={workflow} script={scripts[name]} details={details ?? false} stepMs={stepMs ?? STEP_MS} />
        : <WorkflowViewer key={name} workflow={workflow} details={details ?? true} />}
    </div>
  );
}

// The workflow with a debug session stepping through it — while it's on
// screen, held still with reduced motion. At the end of a branch it starts
// over, the script's next pass (from the trigger it names).
function DebuggingViewer({ workflow, script, details, stepMs }: { workflow: IWorkflowRuntime; script?: Script; details: boolean; stepMs: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.3 });
  const reduce = useReducedMotion();
  const debug = useDebugSimulation(workflow);
  const pass = useRef(0);
  const visits = useRef(new Map<string, number>());

  // Each node's "Component › Alias", to look the script up by — and back.
  const labels = useMemo(() => {
    const map = new Map<string, string>([[workflow.start.id, 'Start']]);
    for (const component of workflow.components) for (const action of component.actions) map.set(action.id, `${component.alias} › ${action.alias}`);
    return map;
  }, [workflow]);
  const nodeOf = (label: string | undefined) => [...labels].find(([, l]) => l === label)?.[0];

  const begin = () => {
    visits.current.clear();
    debug.start(nodeOf(script?.(pass.current).entry));
  };

  const { state } = debug;
  const stepRef = useRef(() => {});
  stepRef.current = () => {
    if (state.status !== 'paused') {
      if (state.status === 'finished') pass.current += 1;
      begin();
      return;
    }
    const plan = script?.(pass.current) ?? {};
    const label = state.nextId ? labels.get(state.nextId) ?? '' : '';
    const visit = visits.current.get(label) ?? 0;
    visits.current.set(label, visit + 1);
    debug.next(at(plan.outputs?.[label], visit), at(plan.values?.[label], visit));
  };

  useEffect(() => {
    if (!inView || reduce) return;
    if (state.status === 'idle') begin();
    const timer = setInterval(() => stepRef.current(), stepMs);
    return () => clearInterval(timer);
  }, [inView, reduce, stepMs]);

  return (
    <div ref={box} className="h-full w-full">
      <WorkflowViewer workflow={workflow} debug={state} details={details} followDebug={false} />
    </div>
  );
}
