import { readFile, writeFile, mkdir, rm, readdir, link, copyFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import { editionDates, validateDailyDraft, validateStoryImages, workspaceFingerprint, assertNoBurnedInAiLabel, assertPublishBaseline } from './lib/daily-newspaper.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`); return args[index + 1]; };
const config = JSON.parse(await readFile(option('--config') || path.join(repo, 'automation/daily-newspaper.json'), 'utf8'));
let explicitDate = option('--date');
const newsDate = option('--news-date');
if (explicitDate && newsDate) throw new Error('Choose --date (edition date) or --news-date (original publication day), not both');
if (newsDate) { const checked = editionDates(new Date(), config.time_zone, newsDate); const next = new Date(checked.windowClosesAt); next.setUTCDate(next.getUTCDate() + 1); explicitDate = next.toISOString().slice(0, 10); }
const dates = editionDates(new Date(), config.time_zone, explicitDate);
const mode = option('--mode') || config.mode;
if (!['build', 'publish'].includes(mode)) throw new Error('Mode must be build or publish');
const runId = randomUUID();
// Each attempt gets fresh outputs: a blocked agent must never publish a stale draft.
const runDir = path.join(repo, '.cache/daily-runs', dates.date, runId);
const draft = path.join(runDir, 'draft.json');
const draftImages = path.join(runDir, 'images');
const publicImages = path.join(repo, 'public/edition-images', dates.date);
const issuePath = path.join(repo, 'src/data/ai-observability', `${dates.date}.json`);
const skillPath = path.join(repo, 'skills/ai-observability-newspaper/SKILL.md');
const command = config.agent.command.map((part) => part.replaceAll('{repo}', repo).replaceAll('{run_dir}', runDir));
const publish = config.publish?.command || [];
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ ...dates, mode, draft, draftImages, issuePath, skillPath, imageGeneration: 'built-in only; unavailable or missing images stop publication', agentCommand: command, publishCommand: mode === 'publish' ? publish : null, scheduleActivated: false }, null, 2));
  process.exit(0);
}
if (new Date(dates.windowClosesAt) > new Date()) throw new Error('The requested source day has not finished; do not publish future or incomplete-day news');
if (mode === 'publish' && !publish.length) throw new Error('Configure the publication command before running publish mode');
if (mode === 'publish' && execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim()) throw new Error('Unattended publishing requires a clean dedicated checkout. Commit/merge the site changes first.');
if (mode === 'publish' && assertPublishBaseline(repo, dates.date, { fastForward: !process.env.NEWSPAPER_RUNNER_REEXEC }) === 'fast-forwarded') {
  // This process already loaded the old runner, rules and config; continue with master's.
  const rerun = spawnSync(process.execPath, process.argv.slice(1), { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, NEWSPAPER_RUNNER_REEXEC: '1' } });
  process.exit(rerun.status ?? 1);
}

const lock = path.join(repo, '.cache/daily-newspaper.lock');
await mkdir(path.dirname(lock), { recursive: true });
try { await mkdir(lock); } catch (error) {
  if (error.code === 'EEXIST') throw new Error('Another newspaper run holds the lock. Inspect .cache/daily-newspaper.lock/owner.json; do not overlap runs.');
  throw error;
}
const temporaryIssue = `${issuePath}.${runId}.tmp`;
await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, runId, started_at: new Date().toISOString() }));
await mkdir(runDir, { recursive: true });
await mkdir(draftImages, { recursive: true });
const status = { run_id: runId, run_dir: runDir, date: dates.date, story_window: dates.storyWindow, mode, stage: 'starting', started_at: new Date().toISOString(), published: false };
const saveStatus = () => writeFile(path.join(runDir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
const exports = new Map();
let createdIssue = false;
let committed = false;
const promotedImages = [];
const stagedPaths = [];

function run(argv, logName, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd: repo, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timeout = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, config.timeout_minutes * 60000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', async (code) => {
      clearTimeout(timeout);
      try {
        await writeFile(path.join(runDir, logName), Buffer.concat(chunks));
        if (code !== 0) reject(new Error(`${argv[0]} exited ${code}; see ${logName}`)); else resolve();
      } catch (error) { reject(error); }
    });
    child.stdin.end(stdin || '');
  });
}

try {
  await saveStatus();
  const directory = path.dirname(issuePath);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  const history = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
  let existing;
  try { existing = JSON.parse(await readFile(issuePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of ['public/md', 'public/json']) {
    try { exports.set(name, await readFile(path.join(repo, name))); } catch (error) { if (error.code !== 'ENOENT') throw error; exports.set(name, null); }
  }
  if (!existing) {
    const fingerprint = await workspaceFingerprint(repo);
    status.stage = 'fetching'; await saveStatus();
    await run(['npm', 'run', 'fetch:sources', '--', '--date', dates.storyWindow], 'source-fetch.log');
    const prompt = `Use $ai-observability-newspaper at ${skillPath}. Read that skill and its editorial policy.\n` +
      `This is an authorized unattended editorial run. Research and create a verified AI-observability-only newspaper draft.\n` +
      `EDITION_DATE: ${dates.date}\nNEWS_DATE: ${dates.storyWindow}\nDRAFT_PATH: ${draft}\n` +
      `IMAGE_DIRECTORY: ${draftImages}\nIMAGE_URL_PREFIX: /edition-images/${dates.date}/\n` +
      `Use only built-in image generation. Confirm that capability is available before research. If unavailable or generation fails, stop with a failure; no image API fallback, credentials request, substitute graphics, or text-only publication.\n` +
      `Every retained story, including briefs, needs a distinct built-in-generated infographic, optimized to a static WebP in IMAGE_DIRECTORY (maximum 300 KB, width at most 1440, shortest edge at least 512), then visually reviewed. Use node scripts/optimize-newspaper-image.js INPUT_IMAGE OUTPUT.webp. Keep original PNGs in the run evidence directory. Record built-in-imagegen provenance, prompt, based_on source URL, reviewed:true, and SHA-256 and actual image_width/image_height of the final WebP, plus optimization metadata returned by the converter. Never reuse the same image across stories. Do not render any AI-generated label, footer or watermark inside images; the site discloses generated graphics once per edition.\n` +
      `Write original story body paragraphs, normally 150–220 words (full stories at least 130). A genuinely sparse source may be a 60+ word brief with brief_reason; it still requires an infographic. Do not pad with invented facts.\n` +
      `The publication day is frozen: ONLY original publications on ${dates.storyWindow}. Never relabel an October 30 item as October 12.\n` +
      `Discovery candidates: ${path.join(repo, '.cache/source-candidates', dates.storyWindow + '.json')}. Research News primary sources separately.\n` +
      `Read all existing issues in src/data/ai-observability before selecting stories. Exclude duplicates within this draft and across every earlier issue, including tracking-URL variants, cross-posts and the same announcement under a rewritten headline.\n` +
      `Write ONLY ${draft}, generated images in ${draftImages}, and research evidence/logs under ${runDir}. Do not alter the application, existing issues, generated exports, Git state, deployment configuration, or schedules.\n` +
      `For every story store source_evidence.url, publication_date, raw_date (ISO primary-source date/timestamp), and method. Record complete checks of hn, news, github. Do not use dateModified or HN resurfacing time as publication proof.\n` +
      `If source checks fail or cannot be completed, report blocked and do not write a fake empty issue. The outer runner validates, builds, commits only approved edition outputs, and publishes; do not perform those steps yourself.\n`;
    await writeFile(path.join(runDir, 'prompt.txt'), prompt);
    status.stage = 'curating'; await saveStatus();
    await run(command, 'agent.log', prompt);
    if (await workspaceFingerprint(repo) !== fingerprint) throw new Error('The editorial agent modified files outside its designated draft/evidence area');
    existing = assertNoBurnedInAiLabel(validateDailyDraft(JSON.parse(await readFile(draft, 'utf8')), dates, history));
    const images = await validateStoryImages(existing, draftImages);
    for (const asset of images) {
      const destination = path.join(repo, 'public', asset.relative);
      await mkdir(path.dirname(destination), { recursive: true });
      // Never overwrite an image from an earlier run or another editor.
      await copyFile(asset.file, destination, constants.COPYFILE_EXCL);
      promotedImages.push(destination);
    }
    await writeFile(temporaryIssue, JSON.stringify(existing, null, 2) + '\n', { flag: 'wx' });
    // Atomically create, without overwriting an issue another editor created meanwhile.
    await link(temporaryIssue, issuePath);
    createdIssue = true;
    await rm(temporaryIssue);
  } else {
    // A retry preserves bytes but must still satisfy the strict date/evidence/duplicate checks.
    validateDailyDraft(existing, dates, history);
    await validateStoryImages(existing, publicImages);
    status.reused_existing_issue = true;
  }
  status.stage = 'validating'; await saveStatus();
  await run(['npm', 'test'], 'tests.log');
  await run(['npm', 'run', 'check'], 'types.log');
  await run(['npm', 'run', 'build'], 'build.log');
  status.source_counts = existing.stories.reduce((counts, story) => { const source = story.source || 'news'; counts[source] = (counts[source] || 0) + 1; return counts; }, {});
  status.stage = 'built'; await saveStatus();
  if (mode === 'publish') {
    const latest = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort().at(-1);
    if (latest !== `${dates.date}.json`) throw new Error('A newer issue exists; do not publish a historical backfill as the daily run');
    if (config.publish.commit_edition) {
      stagedPaths.push(path.relative(repo, issuePath), 'public/md', 'public/json', ...existing.stories.map((story) => `public${story.image}`));
      await run(['git', 'add', '--', ...stagedPaths], 'git-stage.log');
      if (execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, encoding: 'utf8' }).trim()) {
        await run(['git', 'commit', '-m', `Publish AI observability edition ${dates.date}`], 'git-commit.log');
        committed = true;
      }
    }
    // Curation can take an hour; never deploy over a master that moved meanwhile.
    assertPublishBaseline(repo, dates.date, { fastForward: false });
    status.stage = 'publishing'; await saveStatus();
    await run(publish, 'publish.log');
    status.published = true;
    status.stage = 'published';
  }
  status.finished_at = new Date().toISOString(); await saveStatus();
  console.log(JSON.stringify(status, null, 2));
} catch (error) {
  if (!committed && status.stage !== 'publishing') {
    if (stagedPaths.length) execFileSync('git', ['restore', '--staged', '--', ...stagedPaths], { cwd: repo });
    for (const file of promotedImages) await rm(file, { force: true });
  }
  if (createdIssue && !committed && status.stage !== 'publishing') {
    await rm(issuePath, { force: true });
    for (const [name, content] of exports) {
      if (content === null) await rm(path.join(repo, name), { force: true }); else await writeFile(path.join(repo, name), content);
    }
  }
  status.failed_stage = status.stage;
  status.stage = 'failed'; status.error = error.message; status.finished_at = new Date().toISOString();
  await saveStatus(); console.error(JSON.stringify(status, null, 2)); process.exitCode = 1;
} finally {
  await rm(temporaryIssue, { force: true });
  await rm(lock, { recursive: true, force: true });
}
