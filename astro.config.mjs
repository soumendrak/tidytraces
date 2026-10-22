// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import devPdf from './scripts/lib/dev-pdf.js';

export default defineConfig({
  site: 'https://tidytraces.com',
  redirects: { '/ai-observability/': '/' },
  integrations: [
    devPdf(),
    sitemap({
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        item.priority = pathname === '/' ? 1 : pathname.includes('archive') ? 0.8 : 0.7;
        return item;
      },
    }),
  ],
});
