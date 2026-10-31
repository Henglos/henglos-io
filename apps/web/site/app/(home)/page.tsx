import Link from 'next/link';
import {
  ArrowRight,
  Cpu,
  Package,
  Server,
  StepForward,
  Variable,
  Workflow,
  Zap,
} from 'lucide-react';
import { LogoMark } from '@/components/logo';
import { BuyMeACoffee } from '@/components/buy-me-a-coffee';
import { LandingMotion, Reveal } from '@/components/landing/motion';
import { Hero } from '@/components/landing/hero';
import { Marquee } from '@/components/landing/marquee';
import { Examples, Showcase } from '@/components/landing/examples';
import { ButtonLink, SectionHeading } from '@/components/landing/button-link';
import { CallToAction, CodeCard, FeatureGrid, Steps, type Feature, type Step } from '@/components/landing/sections';

export default function HomePage() {
  return (
    <LandingMotion>
      <main className="flex flex-1 flex-col">
        <Hero />
        <Marquee />
        <Examples />
        <Features />
        <Showcase
          name="triggers"
          windowTitle="Triggers"
          eyebrow="Triggers"
          title="Every trigger runs its own branch"
          body="Start joins the Wi-Fi once. Then a request on /led and a timer each start a branch of their own — side by side, each with its own values."
          points={[
            'Start, a pin, a timer, a web request, an IR code, a leak — each one a node with no input.',
            'A branch that fires runs right away, even while another waits in a Delay.',
            'Listen on a trigger in the debugger, and step through its branch when it fires.',
          ]}
        />
        <Showcase
          reverse
          name="button-led"
          windowTitle="Button → LED"
          eyebrow="The debugger"
          title="Step through it, value by value"
          body="Debug pauses before each action. See what the last one published, where the flow goes next, and go on when you're ready."
          points={[
            'Every output on screen — a reading, a list, an object as a table.',
            'Edit a config or a value mid-session, then Continue.',
            'Run a single action with ▶ to try it out on the board.',
          ]}
        />
        <HowItWorks />
        <Extend />
        <CallToAction />
        <Footer />
      </main>
    </LandingMotion>
  );
}

// ── Features ──────────────────────────────────────────────────────────────

const features: Feature[] = [
  {
    icon: <Workflow />,
    title: 'A visual studio',
    body: 'Actions are nodes, outputs are wires. Branch with If and Switch (as many cases as you need), loop with Repeat, keep notes on every node.',
  },
  {
    icon: <Zap />,
    title: 'Triggers',
    body: 'Start, a pin changing, a timer, a web request, an IR code, a leak — each trigger runs its own branch, side by side with the others.',
  },
  {
    icon: <Cpu />,
    title: 'Many boards',
    body: 'A board is a package — its pins, its firmware, what it offers (Wi-Fi, Bluetooth). ESP32 out of the box; move a workflow to another board in its settings.',
  },
  {
    icon: <StepForward />,
    title: 'A step-through debugger',
    body: 'Run the flow one action at a time, or Listen on a trigger until it fires. Read every output, edit configs and values on the fly, then Continue.',
  },
  {
    icon: <Package />,
    title: 'Components from npm',
    body: 'Sensors, displays, Wi-Fi, HTTP, IR, servos… each an npm package. Install them from a registry, or publish your own in a few lines of MicroPython.',
  },
  {
    icon: <Variable />,
    title: 'Bindings and variables',
    body: "Feed one action's output into another's config — or further down the flow with Pass Context — and keep values in workflow variables across loops.",
  },
  {
    icon: <Server />,
    title: 'Yours to host',
    body: 'Run the whole platform on your own machine or server, and move workflows around as portable .hio files.',
  },
];

function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <Reveal>
        <SectionHeading
          eyebrow="What you get"
          title="Everything between the idea and the blinking LED"
          body="One place to design, run and inspect what your microcontroller does."
        />
      </Reveal>
      <FeatureGrid features={features} />
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────

const steps: Step[] = [
  {
    title: 'Host it and pair a driver',
    body: 'Start Henglos IO on your machine, then pair the driver on the computer your board is plugged into.',
    code: 'hio driver login <token> "My bench"',
    command: true,
  },
  {
    title: 'Compose a workflow',
    body: 'Pick a board, add components from the library, and wire their actions and triggers on the canvas.',
    code: 'Request Trigger → GPIO Write → Respond',
  },
  {
    title: 'Upload, run and debug',
    body: 'Compile and upload in one click, run a single action with ▶, or step through the whole flow.',
    code: 'Step 2 → Success · value = true',
  },
];

function HowItWorks() {
  return (
    <section className="border-y border-line-subtle bg-chrome">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow="How it works" title="From a fresh board to a running flow" />
        </Reveal>
        <Steps steps={steps} />
      </div>
    </section>
  );
}

// ── Extend ────────────────────────────────────────────────────────────────

const manifest = `kind: component
name: Water Sensor
dependences:
  platform: ^3.0.0

schema:
  displayName: Water Sensor
  actions:
    - displayName: Read
      icon: droplets
      script: src/read.py
      configurations:
        - displayName: Signal Pin
          type: pin
          from: board
          filterBy: [analog_in]
      outputSchema:
        - name: wet
          type: bool

  triggers:
    - displayName: Water Trigger
      icon: siren
      script: src/water_trigger.py`;

const script = `from machine import ADC, Pin
from hio.sdk import HIOAction, action, SUCCESS, FALLBACK


@action("water sensor/read")
class ReadAction(HIOAction):

    async def execute(self, context):
        pin = context.get("read/signal pin")
        if pin is None:
            return FALLBACK

        level = ADC(Pin(pin)).read_u16()
        context.set("wet", level > 8000)
        return SUCCESS`;

function Extend() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.4fr]">
        <Reveal className="lg:sticky lg:top-24">
          <SectionHeading
            align="left"
            eyebrow="Build your own"
            title="A component is a manifest and a script"
            body="Describe its actions and triggers in YAML — configs, outputs, an icon, what it needs of the board — write each one in MicroPython, publish it to npm. The studio builds the nodes, the forms and the bindings from the manifest."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/docs/packages/building-a-component">
              Build a component <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/docs/packages/building-a-board">
              Build a board <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </Reveal>
        <div className="grid gap-4">
          <CodeCard file="manifest.yaml" code={manifest} />
          <CodeCard file="src/read.py" code={script} delay={0.15} />
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-line-subtle">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:px-6">
        <span className="flex items-center gap-2">
          <LogoMark className="h-3.5 w-auto text-fg" />
          Henglos IO
        </span>
        <nav className="flex gap-6">
          <Link href="/docs" className="transition-colors hover:text-fg">Docs</Link>
          <Link href="/docs/getting-started" className="transition-colors hover:text-fg">Getting started</Link>
          <Link href="/docs/built-packages" className="transition-colors hover:text-fg">Packages</Link>
        </nav>
        <BuyMeACoffee />
      </div>
    </footer>
  );
}
