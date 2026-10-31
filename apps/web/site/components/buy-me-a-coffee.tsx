import { Cookie } from 'next/font/google';
import clsx from 'clsx';
import { COFFEE_URL } from '@/lib/links';

// Buy Me a Coffee's own button font.
const cookie = Cookie({ weight: '400', subsets: ['latin'], display: 'swap' });

/**
 * The "Buy me a coffee" button — drawn here, as their widget draws it (yellow,
 * black outline, the Cookie font): their script writes the button with
 * document.write, which a React page has already finished by the time it runs.
 */
export function BuyMeACoffee({ className }: { className?: string }) {
  return (
    <a
      href={COFFEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      // Their colors, as given — inline: the site's theme redefines Tailwind's black.
      style={{ backgroundColor: '#FFDD00', color: '#000000', borderColor: '#000000' }}
      className={clsx(
        'inline-flex h-10 items-center gap-2 rounded-lg border px-4 shadow-[0_2px_8px_rgb(0_0_0/0.25)] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgb(0_0_0/0.3)]',
        className,
      )}
    >
      <span aria-hidden="true" className="text-lg leading-none">☕</span>
      <span className={clsx(cookie.className, 'text-2xl leading-none')}>Buy me a coffee</span>
    </a>
  );
}
