import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Reuse the presentation test's real build and browser. Optional screenshots are
// local run evidence, not publication assets.
export async function verifyEditionAnimation(browser, origin, evidenceDir) {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const selector = '[data-story-animation]';
  const loaded = async () => {
    await page.$$eval(`${selector} img`, imgs => imgs.forEach(img => { img.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-story-animation] img')].every(img => img.complete && img.naturalWidth > 0));
    // Dismiss the existing installation banner so it cannot cover the diagram
    // or intercept the click intended for the image preview.
    await page.$eval('#pwa-close-btn', button => button.click());
  };
  const sources = () => page.$$eval(`${selector} img`, imgs => imgs.map(img => img.currentSrc));
  try {
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.goto(`${origin}/ai-observability/2026-10-22/`, { waitUntil: 'networkidle0' });
      await loaded();
      assert.equal((await sources()).filter(src => src.endsWith('.gif')).length, 6);
      assert.equal(await page.$$eval(`${selector} button`, buttons => buttons.filter(b => !b.hidden && !b.disabled).length), 6);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      if (evidenceDir) {
        for (let i = 0; i < 6; i++) {
          const image = (await page.$$(`${selector}`))[i];
          await image.scrollIntoView();
          await image.screenshot({ path: `${evidenceDir}/${width}-story-${i + 1}.png` });
        }
      }
    }
    // Clicking an animated illustration keeps the animation in the zoom view.
    await page.click(`${selector} img`);
    await page.waitForSelector('#image-modal.is-open');
    assert.match(await page.$eval('#image-modal-img', img => img.src), /\.gif$/);
    // Live OS preference changes apply to the open modal and every story.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(() => document.querySelector('#image-modal-img').src.endsWith('.webp'));
    await loaded();
    assert.ok((await sources()).every(src => src.endsWith('.webp')));
    assert.equal(await page.$$eval(`${selector} button`, buttons => buttons.filter(b => b.disabled).length), 6);
    await page.keyboard.press('Escape');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await loaded();
    await page.click(`${selector} button`);
    await page.waitForFunction(() => document.querySelector('[data-story-animation] img').currentSrc.endsWith('.webp'));
    assert.equal(await page.$eval(`${selector} button`, b => b.textContent), 'Play animation');
    await page.click(`${selector} img`);
    assert.match(await page.$eval('#image-modal-img', img => img.src), /\.webp$/);
    await page.keyboard.press('Escape');
    await page.click(`${selector} button`);
    await loaded();
    assert.ok((await sources())[0].endsWith('.gif'));
    await page.emulateMediaType('print');
    await loaded();
    assert.ok((await sources()).every(src => src.endsWith('.webp')));
    assert.equal(await page.$eval(`${selector} button`, b => getComputedStyle(b).display), 'none');
    await page.emulateMediaType('screen');
    await page.setJavaScriptEnabled(false);
    await page.reload({ waitUntil: 'networkidle0' });
    await loaded();
    assert.ok((await sources()).every(src => src.endsWith('.webp')), 'no-JS is static');
    assert.ok(await page.$$eval(`${selector} img`, imgs => imgs.every(img => !getComputedStyle(img).filter.includes('blur'))), 'no-JS fallback stays readable');
    await page.setJavaScriptEnabled(true);
    await page.setRequestInterception(true);
    page.on('request', req => req.url().endsWith('.gif') ? req.abort() : req.continue());
    await page.reload({ waitUntil: 'networkidle0' });
    await loaded();
    assert.ok((await sources()).every(src => src.endsWith('.webp')), 'failed GIFs fall back');
    assert.equal(await page.$$eval(`${selector} button`, buttons => buttons.filter(b => b.disabled && b.textContent === 'Static image').length), 6);
    await page.goto(`${origin}/ai-observability/2026-10-21/`, { waitUntil: 'networkidle0' });
    assert.equal((await page.$$(selector)).length, 0, 'historical edition has no animation controls');
    assert.deepEqual(errors, [], 'no browser script errors');
  } finally { await page.close(); }
}
