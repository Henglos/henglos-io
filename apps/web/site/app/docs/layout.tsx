import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { baseOptions } from '@/lib/layout.shared';
import { BuyMeACoffee } from '@/components/buy-me-a-coffee';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      // The sidebar's own switch sits in a full-width bar meant for icon links
      // (none here) — instead, just the switch, its own size, bottom left.
      themeSwitch={{ enabled: false }}
      // key: fumadocs renders the footer inside a list.
      sidebar={{
        footer: [
          <BuyMeACoffee key="coffee" className="mb-2 w-fit" />,
          <ThemeSwitch key="theme-switch" className="w-fit" />,
        ],
      }}
    >
      {children}
    </DocsLayout>
  );
}
