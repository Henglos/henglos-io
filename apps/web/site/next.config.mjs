import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // A static site (out/): served as plain files — Cloudflare Pages, GitHub Pages…
  output: 'export',
  reactStrictMode: true,
  // Ship their TypeScript source — the docs render workflows with the studio's canvas.
  transpilePackages: ['@henglosio/ui', '@henglosio/workflow-ui'],
  images: { unoptimized: true },
  // Dev only: Next's badge would sit on the docs sidebar's theme switch (bottom left).
  devIndicators: { position: 'bottom-right' },
};

export default withMDX(config);
