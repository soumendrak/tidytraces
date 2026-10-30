import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MIN_STORIES_AFTER_FEATURE } from '../../src/lib/storyLayout.js';

/** @param {import('puppeteer').Browser} browser @param {string} outDir @param {string[]} days */
export async function assertEditionLayout(browser, outDir, days) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const { pathname } = new URL(request.url());
    const body = await readFile(path.join(outDir, pathname.endsWith('/') ? `${pathname}index.html` : pathname)).catch(() => null);
    const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(pathname)] || 'text/html';
    if (body) request.respond({ body, contentType });
    else request.abort();
  });
  for (const width of [1440, 1000]) {
    await page.setViewport({ width, height: 900 });
    for (const day of days) {
      await page.goto(`https://tidytraces.test/ai-observability/${day}/`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const stories = [...document.querySelectorAll('.newspaper-columns > .story')];
        const spanners = stories.filter((story) => getComputedStyle(story).columnSpan === 'all');
        const cuts = spanners.map((story) => story.getBoundingClientRect().top);
        const segments = new Map();
        let tallestHead = 0;
        for (const story of stories.filter((candidate) => !spanners.includes(candidate))) {
          const image = story.querySelector('.story-image-wrapper:not([hidden])');
          const top = story.getClientRects()[0]?.top ?? 0;
          tallestHead = Math.max(tallestHead, (image ? image.getBoundingClientRect().bottom : story.querySelector('.story-headline').getBoundingClientRect().bottom) - top);
          for (const rect of story.getClientRects()) {
            const segment = cuts.filter((cut) => cut < rect.top).length;
            const columns = segments.get(segment) ?? new Map();
            segments.set(segment, columns);
            columns.set(Math.round(rect.left), Math.max(columns.get(Math.round(rect.left)) ?? 0, rect.bottom));
          }
        }
        const spreads = [...segments.values()].map((columns) => Math.max(...columns.values()) - Math.min(...columns.values()));
        const images = [...document.querySelectorAll('.story-image-wrapper:not([hidden]) img')].map((img) => {
          const expected = img.getBoundingClientRect().width * Number(img.getAttribute('height')) / Number(img.getAttribute('width'));
          return Math.abs(img.getBoundingClientRect().height - expected);
        });
        const followers = stories.flatMap((story, index) => (story.classList.contains('is-feature') ? [stories.length - index - 1] : []));
        return { followers, spread: Math.max(0, ...spreads), tallestHead, imageError: Math.max(0, ...images), pending: document.querySelectorAll('.story-image-wrapper.is-loading').length };
      });
      assert.ok(layout.spread <= layout.tallestHead + 96, `${day} at ${width}px leaves a ${Math.round(layout.spread)}px column gap`);
      assert.ok(layout.followers.every((count) => count >= MIN_STORIES_AFTER_FEATURE), `${day} at ${width}px keeps every feature above a full row of stories`);
      assert.ok(layout.imageError < 2, `${day} at ${width}px reserves each image at its intrinsic ratio`);
      if (width === 1440 && day === days.toSorted().at(-1)) assert.ok(layout.pending > 0, 'lazy images below the fold are still pending when measured');
    }
  }
  await page.close();
}
