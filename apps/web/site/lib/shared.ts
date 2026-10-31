import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Henglos IO';
export const appDescription =
  'Design what your microcontroller does as a flow, run it on the real board, and step through it action by action.';

export const docsRoute = '/docs';
export const docsContentRoute = '/llms.mdx/docs';

const getContentUrl = createGetUrl(docsContentRoute);

/** Each docs page as plain markdown — the "Copy page" button and LLM tools read it. */
export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];
  return { segments, url: getContentUrl(segments, page.locale) };
}
