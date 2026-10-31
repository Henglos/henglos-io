import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logo } from '@/components/logo';

// What the landing's and the docs' layouts share: the nav.
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
    },
    links: [
      { text: 'Docs', url: '/docs', active: 'nested-url' },
    ],
  };
}
