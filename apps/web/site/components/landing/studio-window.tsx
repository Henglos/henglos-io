import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The studio's window around a canvas: the title bar with the workflow's
 * name, its board and — while a debug session plays — the Debugging pill,
 * with a glow behind it so it lifts off the page.
 */
export function StudioWindow({
  title,
  board = 'ESP32',
  debugging,
  className,
  children,
}: {
  title: string;
  board?: string;
  debugging?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx('relative', className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 rounded-[48px] opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(60% 60% at 50% 40%, var(--accent-subtle), transparent 70%)' }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-canvas shadow-[0_40px_120px_-32px_rgb(0_0_0/0.75)] ring-1 ring-accent-line/30">
        <div className="flex h-11 items-center gap-3 border-b border-line-subtle bg-chrome px-4">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </span>
          <span className="ml-2 truncate text-sm font-medium text-fg">{title}</span>
          <span className="hidden rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[11px] text-fg-muted sm:inline">{board}</span>
          {debugging && (
            <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-subtle px-2.5 py-0.5 text-[11px] font-medium text-accent-fg">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              Debugging
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
