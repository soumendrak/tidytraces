import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, cp, symlink, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parsePdfArgs, generatePdfs, startPdfServer, validatePdfFonts } from '../scripts/lib/pdf-editions.js';
import { editionFingerprint } from '../src/lib/editionFingerprint.js';
import { observabilityIssueSchema } from '../src/lib/observabilitySchema.js';

test('PDF options reject conflicting dates, missing values, and uploads to the upstream CDN', () => {
  assert.deepEqual(parsePdfArgs([]), {});
  assert.deepEqual(parsePdfArgs(['--all', '--no-upload']), { all: true });
  assert.deepEqual(parsePdfArgs(['--day', '2026-10-14']), { day: '2026-10-14' });
  for (const args of [['--day'], ['--day', '../secret'], ['--all', '--day', '2026-10-14'], ['--upload'], ['--unknown']]) {
    assert.throws(() => parsePdfArgs(args));
  }
});

test('PDF generation supports an empty issue and refuses a missing or stale build', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tidytraces-pdf-'));
  const source = path.join(root, 'src/data/ai-observability');
  const built = path.join(root, 'dist/ai-observability/2026-10-14');
  try {
    await mkdir(source, { recursive: true });
    const edition = observabilityIssueSchema.parse({ date: '2026-10-14', story_window: '2026-10-13', dek: 'No qualifying stories.', stories: [] });
    await writeFile(path.join(source, '2026-10-14.json'), JSON.stringify(edition));
    await assert.rejects(generatePdfs({ root }), /Run npm run build first/);
    await mkdir(built, { recursive: true });
    await writeFile(path.join(built, 'index.html'), '<article id="newspaper-sheet" data-day="2026-10-13"></article>');
    await assert.rejects(generatePdfs({ root }), /is stale/);
    await cp(new URL('../public/fonts/', import.meta.url), path.join(root, 'dist/fonts'), { recursive: true });
    await writeFile(path.join(built, 'index.html'), `<link rel="stylesheet" href="/fonts/newspaper.css"><article id="newspaper-sheet" data-day="2026-10-14" data-count="0" data-content-fingerprint="${editionFingerprint(edition)}"><p style="font-family:'PT Serif'">No qualifying stories in this publication window.</p><a href="/archive/?month=10#calendar">Archive</a><a href="../2026-10-13/">Previous</a><a href="https://example.com/article">Source</a></article>`);
    const results = await generatePdfs({ root, all: true });
    assert.equal(results.length, 1);
    assert.equal((await readFile(path.join(root, 'dist/pdf/2026-10-14.pdf'))).subarray(0, 5).toString(), '%PDF-');
    const pdf = await PDFDocument.load(await readFile(path.join(root, 'dist/pdf/2026-10-14.pdf')));
    const links = pdf.getPages().flatMap((page) => (page.node.Annots()?.asArray() || []).map((reference) => {
      const annotation = pdf.context.lookup(reference, PDFDict);
      return annotation.lookup(PDFName.of('A'), PDFDict).lookup(PDFName.of('URI')).decodeText();
    }));
    assert.ok(links.includes('https://tidytraces.com/archive/?month=10#calendar'));
    assert.ok(links.includes('https://tidytraces.com/ai-observability/2026-10-13/'));
    assert.ok(links.includes('https://example.com/article'));
    assert.ok(links.every((url) => !/localhost|127\.0\.0\.1|\[::1\]/.test(url)));

    // Editing text with the same date and story count must reject the old HTML.
    await writeFile(path.join(source, '2026-10-14.json'), JSON.stringify({ ...edition, dek: 'Corrected editorial description.' }));
    await assert.rejects(generatePdfs({ root }), /is stale/);
    const server = await startPdfServer(path.join(root, 'dist'));
    try {
      const response = await fetch(`${server.origin}/pdf/latest.pdf`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal((await fetch(`${server.origin}/%2e%2e%2fpackage.json`)).status, 404);
    } finally { await server.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fingerprints catch editorial corrections without depending on JSON key order', () => {
  const edition = { date: '2026-10-14', dek: 'Daily', stories: [{ title: 'Title', body: ['Body'], takeaway: 'Takeaway', image: '/one.webp' }] };
  const expected = editionFingerprint(edition);
  assert.equal(editionFingerprint({ stories: edition.stories, dek: edition.dek, date: edition.date }), expected);
  for (const key of ['title', 'body', 'takeaway', 'image']) {
    const corrected = structuredClone(edition);
    corrected.stories[0][key] = key === 'body' ? ['Corrected body'] : 'Corrected content';
    assert.notEqual(editionFingerprint(corrected), expected, key);
  }
});

test('local fonts load with Google blocked; fallback faces and stalled requests fail', async () => {
  const { default: puppeteer } = await import('puppeteer');
  const root = await mkdtemp(path.join(tmpdir(), 'tidytraces-fonts-'));
  await cp(new URL('../public/fonts/', import.meta.url), path.join(root, 'fonts'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<link rel="stylesheet" href="/fonts/newspaper.css"><p style="font-family:Lora">Local newspaper fonts</p>');
  const server = await startPdfServer(root);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>No registered newspaper faces.</p>');
    await assert.rejects(validatePdfFonts(page), /Required PDF font is not loaded/);
    await page.setRequestInterception(true);
    const requested = [];
    page.on('request', (request) => {
      requested.push(request.url());
      if (request.url().includes('fonts.invalid')) return; // Deliberately stall the final check.
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url())) void request.abort();
      else void request.continue();
    });
    await page.goto(server.origin, { waitUntil: 'load' });
    await validatePdfFonts(page);
    assert.ok(requested.some((url) => url.endsWith('.woff2')));
    assert.ok(requested.every((url) => new URL(url).origin === server.origin), 'printing needs no font CDN');
    const faces = ['Lora', 'PT Serif'].flatMap((family) => ['normal', 'italic'].map((style) => `@font-face{font-family:"${family}";font-style:${style};font-weight:400 700;src:url("https://fonts.invalid/stalled.woff2")}`)).join('');
    await page.setContent(`<style>${faces}</style><p>Stalled font</p>`, { waitUntil: 'domcontentloaded' });
    await assert.rejects(validatePdfFonts(page, 100), /fonts did not finish loading within 100 ms/);
  } finally {
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('live dev downloads work without dist, survive errors, and reflect content edits', { timeout: 240000 }, async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), 'tidytraces-dev-pdf-'));
  const astroCli = fileURLToPath(new URL('./bin/astro.mjs', import.meta.resolve('astro/package.json')));
  let child;
  let logs = '';
  try {
    for (const name of ['src', 'public', 'scripts/lib', 'astro.config.mjs']) {
      await cp(path.join(repo, name), path.join(root, name), { recursive: true });
    }
    await symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    // Run the same worker as just dev, with a longer readiness deadline for busy CI machines.
    child = spawn(process.execPath, [astroCli, 'dev', '--host', '127.0.0.1', '--port', '0'], {
      cwd: root, env: { ...process.env, ASTRO_DEV_BACKGROUND: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { logs += data; });
    child.stderr.on('data', (data) => { logs += data; });
    let lock;
    const readyDeadline = Date.now() + 90000;
    while (!lock) {
      try { lock = JSON.parse(await readFile(path.join(root, '.astro/dev.json'), 'utf8')); } catch {}
      if (!lock) {
        assert.equal(child.exitCode, null, logs);
        assert.ok(Date.now() < readyDeadline, `Dev server readiness timed out: ${logs}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const { port } = lock;
    const origin = `http://127.0.0.1:${port}`;
    const source = path.join(root, 'src/data/ai-observability');
    const names = (await readdir(source)).filter((name) => name.endsWith('.json')).sort();
    const latest = names.at(-1).slice(0, -5), historical = names.at(-2).slice(0, -5);
    const download = async (url, day) => {
      const response = await fetch(`${origin}${url}`);
      if (response.status !== 200) assert.fail(`${response.status}: ${(await response.text()).slice(0, 1000)}`);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.match(response.headers.get('content-disposition'), new RegExp(`tidy-traces-${day}\\.pdf`));
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
      assert.equal((await fetch(origin)).status, 200, 'reader stays alive after downloading');
      return buffer;
    };
    await assert.rejects(readFile(path.join(root, 'dist/index.html')), /ENOENT/, 'no production build exists');
    const homepageResponse = await fetch(origin);
    const homepage = await homepageResponse.text();
    assert.equal(homepageResponse.status, 200, logs);
    assert.ok(homepage.includes(`href="/pdf/${latest}.pdf"`), homepage.slice(0, 2000));
    const repeated = await Promise.all([download(`/pdf/${latest}.pdf`, latest), download(`/pdf/${latest}.pdf`, latest)]);
    assert.deepEqual(repeated[0], repeated[1], 'simultaneous clicks share the same render');
    await download(`/pdf/${historical}.pdf`, historical);
    for (const url of ['/pdf/latest.pdf', '/latest.pdf']) {
      const response = await fetch(origin + url, { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-disposition'), new RegExp(latest));
    }
    assert.equal((await fetch(`${origin}/pdf/2000-01-01.pdf`)).status, 404);

    const file = path.join(source, `${latest}.json`);
    const edition = JSON.parse(await readFile(file, 'utf8'));
    edition.stories.pop();
    edition.dek = 'Live PDF E2E updated edition';
    await writeFile(file, JSON.stringify(edition));
    const deadline = Date.now() + 15000;
    while (!(await (await fetch(`${origin}/ai-observability/${latest}/`)).text()).includes(edition.dek)) {
      assert.ok(Date.now() < deadline, 'Astro refreshes edited content');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await download('/pdf/latest.pdf', latest); // Render validation also checks the updated story count.
    // A missing infographic must produce a handled error, not terminate the dev process.
    const imageFile = path.join(root, 'public', edition.stories[0].image.replace(/^\//, ''));
    const image = await readFile(imageFile);
    try {
      await rm(imageFile);
      assert.equal((await fetch(`${origin}/pdf/${latest}.pdf`)).status, 503);
      assert.equal((await fetch(origin)).status, 200);
    } finally { await writeFile(imageFile, image); }
    await download('/latest.pdf', latest);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    await rm(root, { recursive: true, force: true });
  }
});
