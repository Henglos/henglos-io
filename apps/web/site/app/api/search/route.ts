import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// Built once at export time: the search index ships as a static file.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
