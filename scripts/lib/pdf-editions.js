import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observabilityIssueSchema } from '../../src/lib/observabilitySchema.js';
import { editionFingerprint } from '../../src/lib/editionFingerprint.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const canonicalOrigin = 'https://tidytraces.com';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pdf': 'application/pdf',
};

export function parsePdfArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--no-upload') continue; // Compatibility with upstream; always local.
    else if (arg === '--day' && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 1] || '')) options.day = args[++i];
    else throw new Error(`Invalid PDF option: ${arg}. Use --help for usage.`);
  }
  if (options.day && options.all) throw new Error('Choose either --day or --all.');
  return options;
}

/** Serve only built assets on a private loopback port, never the source tree. */
export async function startPdfServer(outDir) {
  const directory = path.resolve(outDir);
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(directory, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
      if (!file.startsWith(`${directory}${path.sep}`)) {
        res.writeHead(404).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : 400).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

export async function readPdfEditions(root = repository) {
  const sourceDir = path.join(root, 'src/data/ai-observability');
  const names = (await readdir(sourceDir)).filter((name) => name.endsWith('.json')).sort();
  const editions = [];
  for (const name of names) {
    const edition = observabilityIssueSchema.parse(JSON.parse(await readFile(path.join(sourceDir, name), 'utf8')));
    if (`${edition.date}.json` !== name) throw new Error(`Edition filename and date disagree: ${name}`);
    editions.push(edition);
  }
  return editions;
}

/** Render the real shared reader, including curated images and creator credit. */
export async function generatePdfs({ root = repository, outDir = path.join(root, 'dist'), day, all = false } = {}) {
  if (day && all) throw new Error('Choose either --day or --all.');
  const editions = await readPdfEditions(root);
  const latest = editions.at(-1)?.date;
  if (!latest) throw new Error('No AI observability issues found.');
  const selected = all ? editions : editions.filter((edition) => edition.date === (day || latest));
  if (!selected.length) throw new Error(`No AI observability issue exists for ${day}.`);
  for (const edition of selected) {
    let html;
    try {
      html = await readFile(path.join(outDir, 'ai-observability', edition.date, 'index.html'), 'utf8');
    } catch {
      throw new Error(`Missing built edition ${edition.date}. Run npm run build first.`);
    }
    if (!html.includes(`data-content-fingerprint="${editionFingerprint(edition)}"`)) {
      throw new Error(`Built edition ${edition.date} is stale. Rebuild the site.`);
    }
  }

  const server = await startPdfServer(outDir);
  let browser;
  const results = [];
  try {
    browser = await launchPdfBrowser();
    const page = await createPdfPage(browser);
    for (const edition of selected) {
      const buffer = await renderEditionPdf(page, edition, `${server.origin}/ai-observability/${edition.date}/`);
      const pdfDir = path.join(outDir, 'pdf');
      await mkdir(pdfDir, { recursive: true });
      await writeFile(path.join(pdfDir, `${edition.date}.pdf`), buffer);
      // Exporting a historical day must never replace the latest aliases.
      if (edition.date === latest) {
        await writeFile(path.join(pdfDir, 'latest.pdf'), buffer);
        await writeFile(path.join(outDir, 'latest.pdf'), buffer);
      }
      results.push({ day: edition.date, bytes: buffer.length });
      console.log(`PDF ${edition.date}: ${(buffer.length / 1024).toFixed(1)} KB`);
    }
    return results;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
}

async function launchPdfBrowser() {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Build workers have no user namespace sandbox; inputs are our trusted static pages.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function createPdfPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });
  // No analytics, PWA registration, persisted filters or user theme in exported editions.
  await page.setJavaScriptEnabled(false);
  await page.emulateMediaType('print');
  return page;
}

async function renderEditionPdf(page, edition, url) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  if (!response?.ok()) throw new Error(`Could not load built edition ${edition.date}.`);
  await page.evaluate(async ({ date, count, fingerprint, canonicalOrigin }) => {
    const sheet = document.querySelector('#newspaper-sheet');
    if (sheet?.getAttribute('data-day') !== date || document.querySelectorAll('.story').length !== count || sheet?.getAttribute('data-content-fingerprint') !== fingerprint) {
      throw new Error(`Edition ${date} is stale. Reload the reader or rebuild the site.`);
    }
    // Only anchors are publicized; CSS, fonts and images still load from our local server.
    for (const anchor of document.querySelectorAll('a[href]')) {
      const target = new URL(anchor.getAttribute('href'), location.href);
      if (target.origin === location.origin) {
        anchor.href = new URL(target.pathname + target.search + target.hash, canonicalOrigin).href;
      }
    }
  }, { date: edition.date, count: edition.stories.length, fingerprint: editionFingerprint(edition), canonicalOrigin });
  await validatePdfFonts(page);
  await page.evaluate(async () => {
    const images = [...document.images].filter((image) => image.getAttribute('src'));
    let timer;
    try {
      await Promise.race([
        Promise.all(images.map(async (image) => {
          image.loading = 'eager';
          try {
            await image.decode();
          } catch {
            throw new Error(`Unable to load PDF image: ${image.getAttribute('src')}`);
          }
          image.classList.remove('loading');
          image.parentElement?.classList.remove('is-loading');
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF images did not finish loading within 30 seconds.')), 30000);
        }),
      ]);
    } finally { clearTimeout(timer); }
  });
  return page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, waitForFonts: false, timeout: 60000 });
}

/** Loading failure also resolves fonts.ready, so require actual loaded faces with a deadline. */
export async function validatePdfFonts(page, timeoutMs = 10000) {
  await page.evaluate(async (timeoutMs) => {
    const required = [
      ...['normal', 'italic'].flatMap((style) => [400, 500, 600, 700].map((weight) => `${style} ${weight} 12px "Lora"`)),
      ...['normal', 'italic'].flatMap((style) => [400, 700].map((weight) => `${style} ${weight} 12px "PT Serif"`)),
    ];
    const sample = document.body.textContent || 'Tidy Traces';
    let timer;
    try {
      await Promise.race([
        Promise.all(required.map(async (font) => {
          let faces;
          try { faces = await document.fonts.load(font, sample); }
          catch { throw new Error(`Unable to load required PDF font: ${font}`); }
          if (!faces.length || faces.some((face) => face.status !== 'loaded') || !document.fonts.check(font, sample)) {
            throw new Error(`Required PDF font is not loaded: ${font}`);
          }
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`PDF fonts did not finish loading within ${timeoutMs} ms.`)), timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }, timeoutMs);
}

/** Generate from the running dev reader without writing into watched source folders. */
export async function generateDevPdf(edition, origin) {
  const browser = await launchPdfBrowser();
  try {
    const page = await createPdfPage(browser);
    return await renderEditionPdf(page, edition, `${origin}/ai-observability/${edition.date}/`);
  } finally { await browser.close(); }
}
