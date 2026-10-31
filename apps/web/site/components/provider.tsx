'use client';
import SearchDialog from '@/components/search';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { type ReactNode } from 'react';

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{ SearchDialog }}
      // `class` for fumadocs' dark styles, `data-theme` for the design
      // system's tokens (light under [data-theme="light"]). Dark first, like the app.
      theme={{ attribute: ['class', 'data-theme'], defaultTheme: 'dark' }}
    >
      {children}
    </RootProvider>
  );
}
