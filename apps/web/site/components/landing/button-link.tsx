import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';

export function ButtonLink({
  href,
  primary,
  external,
  className,
  children,
}: {
  href: string;
  primary?: boolean;
  /** Another site: opens in a new tab. */
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Anchor = external ? 'a' : Link;
  return (
    <Anchor
      href={href}
      {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
      className={clsx(
        'group inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-all duration-200 [&_svg]:transition-transform [&_svg]:duration-200',
        primary
          ? 'bg-accent text-on-accent shadow-[0_0_0_0_var(--accent-subtle)] hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_8px_32px_-4px_var(--accent-line)] hover:[&_svg:last-child]:translate-x-0.5'
          : 'border border-line-strong bg-panel text-fg hover:-translate-y-0.5 hover:border-accent-line hover:bg-raised',
        className,
      )}
    >
      {children}
    </Anchor>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  body?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <span className="text-xs font-medium uppercase tracking-widest text-accent-fg">{eyebrow}</span>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-fg-secondary">{body}</p>}
    </div>
  );
}
