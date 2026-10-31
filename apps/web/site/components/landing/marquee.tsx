import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  AudioLines,
  Clock,
  Code2,
  Cpu,
  Droplets,
  FolderOpen,
  Gamepad2,
  GitBranch,
  Globe,
  Monitor,
  Move3d,
  Radar,
  Radio,
  RotateCw,
  Thermometer,
  ToggleRight,
  Tv,
  Variable,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

// The packages Henglos IO ships (see /docs/built-packages), scrolling by in two
// rows — each with its triggers (the studio's green mark) and its actions.
type Item = {
  icon: LucideIcon;
  name: string;
  kind: string;
  triggers?: string[];
  actions: string[];
  /** Its page under /docs/built-packages. */
  slug: string;
};

const ROW_A: Item[] = [
  { icon: ToggleRight, name: 'GPIO', kind: 'Pins', triggers: ['Pin Trigger'], actions: ['Read', 'Write'], slug: 'gpio' },
  { icon: Thermometer, name: 'DHT', kind: 'Sensor', triggers: ['Climate Trigger'], actions: ['Read'], slug: 'dht' },
  { icon: RotateCw, name: 'Servo', kind: 'Motor', actions: ['To Angle', 'Rotate', 'Release'], slug: 'servo' },
  { icon: Droplets, name: 'Water Sensor', kind: 'Sensor', triggers: ['Water Trigger'], actions: ['Read', 'Detect'], slug: 'water-sensor' },
  { icon: Activity, name: 'PWM', kind: 'Pins', actions: ['Write', 'Fade', 'Stop'], slug: 'pwm' },
  { icon: AudioLines, name: 'Sound Sensor', kind: 'Sensor', triggers: ['Sound Trigger'], actions: ['Read', 'Detect'], slug: 'sound-sensor' },
  { icon: Radar, name: 'Ultrasonic', kind: 'Sensor', actions: ['Measure', 'Detect'], slug: 'ultrasonic-sensor' },
  { icon: Clock, name: 'Time', kind: 'Timing', triggers: ['Timer Trigger'], actions: ['Delay', 'Every', 'Elapsed'], slug: 'time' },
  { icon: Move3d, name: 'IMU', kind: 'Sensor', actions: ['Read', 'Tilt', 'Motion'], slug: 'imu' },
  { icon: Gamepad2, name: 'Joystick', kind: 'Input', actions: ['Read', 'Direction', 'Button'], slug: 'joystick' },
];

const ROW_B: Item[] = [
  { icon: Wifi, name: 'WiFi', kind: 'Network', actions: ['Connect', 'Scan', 'Access Point'], slug: 'wifi' },
  { icon: Globe, name: 'HTTP', kind: 'Network', triggers: ['Request Trigger'], actions: ['Request', 'Respond'], slug: 'http' },
  { icon: Monitor, name: 'Display', kind: 'OLED', actions: ['Print', 'Chart', 'Gauge'], slug: 'display' },
  { icon: Radio, name: 'IR', kind: 'Remote', triggers: ['Code Trigger'], actions: ['Send', 'Receive'], slug: 'ir' },
  { icon: Tv, name: 'LCD', kind: 'Character LCD', actions: ['Print', 'Clear', 'Backlight'], slug: 'lcd' },
  { icon: GitBranch, name: 'Logic', kind: 'Built in', actions: ['If', 'Switch', 'Repeat'], slug: 'core' },
  { icon: FolderOpen, name: 'Filesystem', kind: 'Data', actions: ['Read', 'Write', 'List'], slug: 'filesystem' },
  { icon: Variable, name: 'Variables', kind: 'Built in', actions: ['Set', 'Append', 'Set Field'], slug: 'core' },
  { icon: Code2, name: 'Code', kind: 'MicroPython', actions: ['Run'], slug: 'code' },
  { icon: Cpu, name: 'ESP32', kind: 'Board', actions: ['wifi', 'bluetooth'], slug: 'esp32' },
];

const COUNT = ROW_A.length + ROW_B.length - 2; // Logic and Variables come with every workflow

function Card({ item }: { item: Item }) {
  return (
    <Link
      href={`/docs/built-packages/${item.slug}`}
      className="group/card flex w-72 shrink-0 items-start gap-3 rounded-xl border border-line bg-panel p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-line hover:bg-raised"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-accent transition-transform duration-200 group-hover/card:-rotate-6 group-hover/card:scale-110">
        <item.icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-fg">{item.name}</span>
          <span className="truncate text-[11px] uppercase tracking-wider text-fg-faint">{item.kind}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {item.triggers?.map((trigger) => (
            <span key={trigger} className="inline-flex items-center gap-1 rounded-md border border-accent-line bg-accent-subtle px-1.5 py-0.5 text-[11px] text-accent-fg">
              <span className="size-1.5 rounded-full bg-accent" />
              {trigger}
            </span>
          ))}
          {item.actions.map((action) => (
            <span key={action} className="rounded-md border border-line-subtle bg-field px-1.5 py-0.5 text-[11px] text-fg-muted">
              {action}
            </span>
          ))}
        </span>
      </span>
    </Link>
  );
}

function Row({ items, reverse, seconds }: { items: Item[]; reverse?: boolean; seconds: number }) {
  // Twice over, so the strip loops without a gap (it slides by exactly half).
  const row = [...items, ...items];
  return (
    <div
      className="group relative overflow-hidden"
      style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}
    >
      {/* CSS (global.css .marquee), so hovering can pause it */}
      <div
        className="marquee flex w-max gap-3 py-1 group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? 'reverse' : 'normal' }}
      >
        {row.map((item, index) => <Card key={index} item={item} />)}
      </div>
    </div>
  );
}

export function Marquee() {
  return (
    <section aria-label="Packages" className="relative border-b border-line-subtle bg-chrome py-14">
      <div className="mx-auto mb-8 flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent-fg">Packages you wire together</p>
          <p className="mt-2 text-lg font-semibold text-fg sm:text-xl">
            {COUNT} packages, ready to install — sensors, motors, displays, the network.
          </p>
        </div>
        <Link
          href="/docs/built-packages"
          className="group/link inline-flex shrink-0 items-center gap-1.5 text-sm text-fg-secondary transition-colors hover:text-fg"
        >
          Browse them all
          <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        <Row items={ROW_A} seconds={70} />
        <Row items={ROW_B} seconds={80} reverse />
      </div>
    </section>
  );
}
