import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { optimizeNewspaperImage } from '../scripts/lib/newspaper-images.js';
import { editionDates, validateDailyDraft, validateStoryImages, assertNoDuplicateStories, assertNoBurnedInAiLabel, assertPublishBaseline } from '../scripts/lib/daily-newspaper.js';

const dates = editionDates(new Date('2026-10-13T02:30:00Z'));
const story = {
  title: 'Verified agent tracing release', url: 'https://example.com/trace/v1', publisher: 'Primary source', published: '2026-10-12', source: 'github', category_key: 'agents',
  summary: 'A verified release.', body: [Array(150).fill('context').join(' ')], takeaway: 'Check trace delivery.', dedupe_key: 'release:example/trace:v1',
  image: '/edition-images/2026-10-13/trace-v1.webp',
  source_evidence: { url: 'https://example.com/trace/v1', publication_date: '2026-10-12', raw_date: '2026-10-12T12:00:00Z', method: 'Official stable release timestamp' },
  image_provenance: { kind: 'generated-editorial', generator: 'built-in-imagegen', prompt: 'Trace delivery infographic', based_on: ['https://example.com/trace/v1'], reviewed: true, sha256: 'a'.repeat(64) },
};
const issue = { date: '2026-10-13', story_window: '2026-10-12', dek: 'Verified issue.', research: { status: 'complete', completed_sources: ['hn', 'news', 'github'], checked_urls: ['https://example.com/blog'] }, stories: [story] };

test('dates are frozen to the chosen calendar zone and explicit edition override', () => {
  assert.equal(dates.storyWindow, '2026-10-12');
  assert.equal(editionDates(new Date('2026-10-12T20:00:00Z')).date, '2026-10-13');
  assert.equal(editionDates(new Date(), 'Asia/Kolkata', '2026-10-13').storyWindow, '2026-10-12');
  assert.throws(() => editionDates(new Date(), 'Asia/Kolkata', '2026-02-30'), /Invalid/);
});

test('daily contract blocks relabelled dates, incomplete research, thin text and every missing brief image', () => {
  assert.equal(validateDailyDraft(issue, dates).stories.length, 1);
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, image: story.image.replace('.webp', '.png') }] }, dates), /local WebP infographic/);
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, source_evidence: { ...story.source_evidence, raw_date: '2026-10-30' } }] }, dates), /outside the window/);
  assert.throws(() => validateDailyDraft({ ...issue, research: { ...issue.research, completed_sources: ['news'] }, stories: [] }, dates), /three source/);
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, body: ['Too short.'] }] }, dates), /130 body words/);
  const brief = { ...story, format: 'brief', body: [Array(70).fill('detail').join(' ')], brief_reason: 'A narrow patch with limited release notes.' };
  assert.equal(validateDailyDraft({ ...issue, stories: [brief] }, dates).stories[0].format, 'brief');
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...brief, image: undefined }] }, dates), /Every story/);
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, image_provenance: undefined }] }, dates), /provenance/);
  // The edition discloses generated graphics once; never burn a per-image AI label into the pixels.
  assert.throws(() => assertNoBurnedInAiLabel({ ...issue, stories: [{ ...story, image_provenance: { ...story.image_provenance, prompt: "Trace flow. Use only specified text plus small footer 'AI-GENERATED EDITORIAL'." } }] }), /AI-generated label/);
  assert.equal(assertNoBurnedInAiLabel(issue), issue);
  const withPrompt = (prompt) => ({ ...issue, stories: [{ ...story, image_provenance: { ...story.image_provenance, prompt } }] });
  assert.throws(() => assertNoBurnedInAiLabel(withPrompt('Readable labels. Use only specified text plus small footer AI-GENERATED EDITORIAL. Flat clean line illustration')), /AI-generated label/);
  // The skill's own constraint line forbids the label; it must not block a compliant draft.
  assert.doesNotThrow(() => assertNoBurnedInAiLabel(withPrompt('Constraints: no invented metrics, no unsupported product architecture,\nno fake screenshots, no unrelated logos, no "AI-generated" label or watermark text;\npreserve source/editorial distinction')));
  assert.doesNotThrow(() => assertNoBurnedInAiLabel(withPrompt('Do not add an AI-generated watermark or footer label.')));
  assert.equal(validateDailyDraft({ ...issue, stories: [] }, dates).stories.length, 0);
});

test('story text carries no dates or version numbers; the takeaway stays separate', () => {
  for (const text of ['Shipped on 2026-10-12.', 'Released October 12 to all users.', 'Upgrade to v4.57.0 first.', 'Version 1.2.3 adds spans.', 'It was released October 2026.', 'Shipped on 27 October.', 'Arrived in 2026.', 'Adds Python 3.12 support.', 'Uses the GPT-4.1 model.', 'The release 2.0 ships.', 'Targets OpenTelemetry 1.30 today.']) {
    for (const field of ['title', 'summary', 'takeaway']) assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, [field]: text }] }, dates), /dates or version numbers/, `${field}: ${text}`);
    assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, body: [`${story.body[0]} ${text}`] }] }, dates), /dates or version numbers/, `body: ${text}`);
  }
  assert.doesNotThrow(() => validateDailyDraft({ ...issue, stories: [{ ...story, summary: 'Scores rose from 0.8 to 0.9 and latency fell 2.5x; teams may 3 times retry.' }] }, dates));
  assert.throws(() => validateDailyDraft({ ...issue, stories: [{ ...story, takeaway: ' ' }] }, dates), /why it matters/);
});

test('deduplication catches same-day URL variants and historic cross-posts with rewritten titles', () => {
  assert.throws(() => assertNoDuplicateStories({ ...issue, stories: [story, { ...story, title: 'Other headline', dedupe_key: 'other', url: story.url + '/?utm_source=hn#read' }] }), /Duplicate/);
  const previous = { date: '2026-10-12', stories: [{ ...story, title: 'Earlier headline', url: 'https://other.example/blog', source_evidence: undefined }] };
  assert.throws(() => assertNoDuplicateStories(issue, [previous]), /Duplicate/);
  assert.doesNotThrow(() => assertNoDuplicateStories({ ...issue, stories: [{ ...story, title: 'Version two', url: 'https://example.com/trace/v2', source_evidence: undefined, dedupe_key: 'release:example/trace:v2' }] }, [previous]));
});

// Synthetic WebP is a test fixture, never a publication image.
async function webp() {
  return sharp({ create: { width: 512, height: 512, channels: 4, background: '#f4ead7' } }).webp().toBuffer();
}

test('actual assets must exist, match review hashes, and be distinct complete WebPs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'newspaper-images-'));
  try {
    const image = await webp();
    const illustrated = { ...story, image_provenance: { ...story.image_provenance, sha256: createHash('sha256').update(image).digest('hex') } };
    await assert.rejects(validateStoryImages({ ...issue, stories: [illustrated] }, directory), /ENOENT/);
    await writeFile(path.join(directory, 'trace-v1.webp'), image);
    assert.equal((await validateStoryImages({ ...issue, stories: [illustrated] }, directory)).length, 1);
    await assert.rejects(validateStoryImages(issue, directory), /changed after/);
    await writeFile(path.join(directory, 'second.webp'), image);
    await assert.rejects(validateStoryImages({ ...issue, stories: [illustrated, { ...illustrated, image: '/edition-images/2026-10-13/second.webp' }] }, directory), /distinct/);
    await writeFile(path.join(directory, 'trace-v1.webp'), image.subarray(0, 24));
    await assert.rejects(validateStoryImages({ ...issue, stories: [illustrated] }, directory), /truncated|invalid/i);
    assert.deepEqual(await validateStoryImages({ ...issue, stories: [] }, '/nonexistent'), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('optimization preserves proportions and WebP validation rejects heavy, damaged or mis-sized graphics', async () => {
  const input = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#f4ead7' } }).png().toBuffer();
  const optimized = await optimizeNewspaperImage(input);
  assert.equal(optimized.image_width, 1440);
  assert.equal(optimized.image_height, 960);
  assert.ok(optimized.data.length <= 300_000);
  const directory = await mkdtemp(path.join(tmpdir(), 'newspaper-webp-'));
  const makeStory = (data, fields = {}) => ({ ...story, ...fields, image_provenance: { ...story.image_provenance, sha256: createHash('sha256').update(data).digest('hex') } });
  const validate = async (data, fields) => {
    await writeFile(path.join(directory, 'trace-v1.webp'), data);
    return validateStoryImages({ ...issue, stories: [makeStory(data, fields)] }, directory);
  };
  try {
    assert.equal((await validate(optimized.data, { image_width: 1440, image_height: 960 })).length, 1);
    await assert.rejects(validate(optimized.data, { image_width: 1800 }), /recorded dimensions/);
    const damaged = Buffer.from(optimized.data.subarray(0, optimized.data.length - 20));
    damaged.writeUInt32LE(damaged.length - 8, 4);
    await assert.rejects(validate(damaged));
    const heavy = await sharp(randomBytes(512 * 512 * 3), { raw: { width: 512, height: 512, channels: 3 } }).webp({ lossless: true }).toBuffer();
    assert.ok(heavy.length > 300_000);
    await assert.rejects(validate(heavy), /300 KB limit/);
    const smallInput = await sharp({ create: { width: 1024, height: 512, channels: 3, background: '#fff' } }).webp().toBuffer();
    // A valid small asset must remain small after conversion, without enlargement.
    const small = await optimizeNewspaperImage(smallInput);
    assert.equal(small.image_width, 1024);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('runner promotes images, rolls back build failure, and safely retries publication after a commit', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'newspaper-runner-'));
  try {
    for (const folder of ['scripts/lib', 'src/lib', 'src/data/ai-observability', 'public', 'automation', 'skills/ai-observability-newspaper']) await mkdir(path.join(root, folder), { recursive: true });
    for (const name of ['scripts/run-daily-newspaper.js', 'scripts/lib/daily-newspaper.js', 'scripts/lib/newspaper-images.js', 'src/lib/observabilitySchema.js']) await copyFile(new URL('../' + name, import.meta.url), path.join(root, name));
    await symlink(new URL('../node_modules', import.meta.url).pathname, path.join(root, 'node_modules'));
    const image = await webp();
    const ready = { ...issue, stories: [{ ...story, image_provenance: { ...story.image_provenance, sha256: createHash('sha256').update(image).digest('hex') } }] };
    await writeFile(path.join(root, 'fixture.json'), JSON.stringify(ready));
    await writeFile(path.join(root, 'fixture.webp'), image);
    await writeFile(path.join(root, '.gitignore'), '.cache/\nnode_modules/\n');
    await writeFile(path.join(root, 'noop.js'), 'process.exit(0);');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'fetch:sources': 'node noop.js', test: 'node noop.js', check: 'node noop.js', build: 'node build.js' } }));
    await writeFile(path.join(root, 'build.js'), "import {writeFileSync} from 'node:fs'; import {execFileSync} from 'node:child_process'; if(process.env.FAIL_BUILD) process.exit(1); if(process.env.ADVANCE_ORIGIN){const o=process.env.ADVANCE_ORIGIN;execFileSync('git',['pull','-q','origin','master'],{cwd:o});writeFileSync(o+'/later.txt','later');execFileSync('git',['add','later.txt'],{cwd:o});execFileSync('git',['-c','user.name=t','-c','user.email=t@example.invalid','commit','-qm','later file'],{cwd:o});execFileSync('git',['push','-q','origin','HEAD:master'],{cwd:o});} writeFileSync('public/md','new export'); writeFileSync('public/json','new json');");
    await writeFile(path.join(root, 'agent.js'), "import {copyFileSync,mkdirSync} from 'node:fs';if(process.env.EMPTY_AGENT)process.exit(0);mkdirSync(process.argv[2]+'/images',{recursive:true});copyFileSync('fixture.json',process.argv[2]+'/draft.json');copyFileSync('fixture.webp',process.argv[2]+'/images/trace-v1.webp');");
    await writeFile(path.join(root, 'publisher.js'), "import {writeFileSync} from 'node:fs';if(process.env.FAIL_PUBLISH)process.exit(2);writeFileSync('.cache/published','yes');");
    await writeFile(path.join(root, 'automation/daily-newspaper.json'), JSON.stringify({ time_zone: 'Asia/Kolkata', mode: 'build', timeout_minutes: 1, agent: { command: [process.execPath, 'agent.js', '{run_dir}'] }, publish: { command: [process.execPath, 'publisher.js'], commit_edition: true } }));
    await writeFile(path.join(root, 'public/md'), 'old export'); await writeFile(path.join(root, 'public/json'), 'old json');
    execFileSync('git', ['init', '-q', '-b', 'master'], { cwd: root });
    const run = (env = {}, mode = 'build') => execFileSync(process.execPath, ['scripts/run-daily-newspaper.js', '--news-date', '2026-10-12', '--mode', mode], { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' });
    assert.throws(() => run({ FAIL_BUILD: '1' }));
    await assert.rejects(readFile(path.join(root, 'src/data/ai-observability/2026-10-13.json')), /ENOENT/);
    await assert.rejects(readFile(path.join(root, 'public/edition-images/2026-10-13/trace-v1.webp')), /ENOENT/);
    assert.equal(await readFile(path.join(root, 'public/md'), 'utf8'), 'old export');
    // Even a zero exit with no new draft cannot reuse outputs from the failed attempt.
    assert.throws(() => run({ EMPTY_AGENT: '1' }));
    await assert.rejects(readFile(path.join(root, 'src/data/ai-observability/2026-10-13.json')), /ENOENT/);
    const result = JSON.parse(run().toString());
    assert.equal(result.stage, 'built'); assert.equal(result.published, false);
    const before = await readFile(path.join(root, 'src/data/ai-observability/2026-10-13.json'));
    assert.equal(JSON.parse(run().toString()).reused_existing_issue, true);
    assert.deepEqual(await readFile(path.join(root, 'src/data/ai-observability/2026-10-13.json')), before);
    assert.deepEqual(await readFile(path.join(root, 'public/edition-images/2026-10-13/trace-v1.webp')), image);
    // Start a clean dedicated checkout and exercise the configured publish path with a stub.
    await rm(path.join(root, 'src/data/ai-observability/2026-10-13.json'));
    await rm(path.join(root, 'public/edition-images'), { recursive: true });
    await writeFile(path.join(root, 'public/md'), 'old export'); await writeFile(path.join(root, 'public/json'), 'old json');
    execFileSync('git', ['config', 'user.name', 'Runner test'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'runner@example.invalid'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'Fixture baseline'], { cwd: root });
    const origin = path.join(root, '.cache/origin.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'master', origin]);
    execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: root });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: root });
    assert.throws(() => run({ FAIL_PUBLISH: '1' }, 'publish'));
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '');
    assert.deepEqual(await readFile(path.join(root, 'src/data/ai-observability/2026-10-13.json')), before);
    const published = JSON.parse(run({}, 'publish').toString());
    assert.equal(published.published, true); assert.equal(published.reused_existing_issue, true);
    assert.equal(await readFile(path.join(root, '.cache/published'), 'utf8'), 'yes');
    // A stale checkout must not redeploy old site code after master moves on (the byline/disclosure revert).
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: root }); // the routine pushes its edition commit
    const other = path.join(root, '.cache/other');
    execFileSync('git', ['clone', '-q', origin, other]);
    await writeFile(path.join(other, 'noop.js'), 'process.exit(0); // newer site code');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'Newer site code'], { cwd: other });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: other });
    // The fast-forward re-executes the runner so master's runner, rules and config apply.
    await writeFile(path.join(other, 'scripts/run-daily-newspaper.js'), (await readFile(path.join(other, 'scripts/run-daily-newspaper.js'), 'utf8')).replace("status.stage = 'built';", "status.stage = 'built'; status.runner = 'master';"));
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'Newer runner'], { cwd: other });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: other });
    const reexecuted = JSON.parse(run({}, 'publish').toString());
    assert.equal(reexecuted.published, true); assert.equal(reexecuted.runner, 'master');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), execFileSync('git', ['rev-parse', 'HEAD'], { cwd: other, encoding: 'utf8' }), 'a behind checkout fast-forwards before deploying');
    assert.match(await readFile(path.join(root, 'noop.js'), 'utf8'), /newer site code/);
    // master moving during curation/build must stop the deploy, not overwrite the newer site.
    await rm(path.join(root, '.cache/published'));
    assert.throws(() => run({ ADVANCE_ORIGIN: other }, 'publish'), /behind or diverged/);
    await assert.rejects(readFile(path.join(root, '.cache/published')), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('publish baseline allows unpushed edition commits but not stale or unmerged site code', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'newspaper-baseline-'));
  const origin = path.join(root, 'origin.git'), work = path.join(root, 'work');
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: work, stdio: 'pipe' });
  try {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'master', origin]);
    execFileSync('git', ['clone', '-q', origin, work], { stdio: 'pipe' });
    await mkdir(path.join(work, 'src/data/ai-observability'), { recursive: true });
    await writeFile(path.join(work, 'app.js'), 'v1');
    git('add', '.'); git('commit', '-qm', 'base'); git('push', '-q', 'origin', 'HEAD:master');
    assert.doesNotThrow(() => assertPublishBaseline(work, '2026-10-13'));
    await writeFile(path.join(work, 'src/data/ai-observability/2026-10-13.json'), '{}');
    git('add', '.'); git('commit', '-qm', 'edition');
    assert.doesNotThrow(() => assertPublishBaseline(work, '2026-10-13'), 'a retry after the local edition commit still publishes');
    await writeFile(path.join(work, 'app.js'), 'unmerged');
    git('commit', '-qam', 'local site change');
    assert.throws(() => assertPublishBaseline(work, '2026-10-13'), /Only this edition's outputs.*app\.js/);
    git('reset', '-q', '--hard', 'HEAD~1');
    await writeFile(path.join(work, 'src/data/ai-observability/2026-10-12.json'), '{"rewritten":true}');
    git('add', '.'); git('commit', '-qm', 'rewrite an earlier issue');
    assert.throws(() => assertPublishBaseline(work, '2026-10-13'), /2026-10-12\.json/, 'only the current edition may be unpushed');
    git('reset', '-q', '--hard', 'origin/master');
    const other = path.join(root, 'other');
    execFileSync('git', ['clone', '-q', origin, other], { stdio: 'pipe' });
    await writeFile(path.join(other, 'app.js'), 'v2');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'v2'], { cwd: other });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:master'], { cwd: other, stdio: 'pipe' });
    await mkdir(path.join(work, 'src/data/ai-observability'), { recursive: true });
    await writeFile(path.join(work, 'src/data/ai-observability/2026-10-13.json'), '{}');
    git('add', '.'); git('commit', '-qm', 'edition on stale base');
    assert.throws(() => assertPublishBaseline(work, '2026-10-13'), /behind or diverged/);
    git('reset', '-q', '--hard', 'HEAD~1');
    assertPublishBaseline(work, '2026-10-13');
    assert.equal(await readFile(path.join(work, 'app.js'), 'utf8'), 'v2', 'a clean, behind checkout fast-forwards');
  } finally { await rm(root, { recursive: true, force: true }); }
});
