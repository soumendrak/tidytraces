import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, readlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { validateNewspaperImage } from './newspaper-images.js';
import { observabilityIssueSchema } from '../../src/lib/observabilitySchema.js';

export function editionDates(now = new Date(), timeZone = 'Asia/Kolkata', explicitDate) {
  const date = explicitDate || new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid edition date: ${date}`);
  const previous = new Date(parsed); previous.setUTCDate(previous.getUTCDate() - 1);
  return { date, storyWindow: previous.toISOString().slice(0, 10), windowClosesAt: parsed.toISOString() };
}

// A per-image label baked into pixels is a visible caption the template cannot hide.
// Clauses that forbid such a label ("no AI-generated watermark") are compliant.
const BURNED_IN_AI_LABEL = /(label|footer|caption|watermark|stamp|badge|corner|text).{0,40}AI[-\s]?GENERATED|AI[-\s]?GENERATED.{0,30}(label|footer|caption|watermark|stamp|badge)/i;
const NEGATION = /\b(no|not|never|without|avoid|omit|exclude|don'?t)\b/i;
const requestsBurnedInLabel = (prompt) => prompt.split(/[.;:,\n]/).some((clause) => BURNED_IN_AI_LABEL.test(clause) && !NEGATION.test(clause));

/**
 * Publishing deploys this checkout, so its application code must be exactly the
 * freshly fetched origin/master; only this edition's unpushed outputs may sit on
 * top. A clean checkout that is merely behind fast-forwards (when allowed); a
 * diverged, stale or feature-branch checkout would otherwise redeploy an old
 * template or rewrite earlier issues.
 */
export function assertPublishBaseline(repo, editionDate, { fastForward = true } = {}) {
  const allowed = (file) => file === `src/data/ai-observability/${editionDate}.json` || file.startsWith(`public/edition-images/${editionDate}/`) || file === 'public/md' || file === 'public/json';
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try { git('fetch', '--quiet', 'origin', 'master'); } catch { throw new Error('Publishing requires fetching origin/master to confirm the deployed application code'); }
  const isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  if (!isAncestor('origin/master', 'HEAD')) {
    if (!fastForward || !isAncestor('HEAD', 'origin/master')) throw new Error('This checkout is behind or diverged from origin/master; rebase the edition commit onto origin/master before publishing or it redeploys stale site code');
    git('merge', '--ff-only', '--quiet', 'origin/master');
    return 'fast-forwarded';
  }
  const changed = git('diff', '--name-only', 'origin/master', 'HEAD').split('\n').filter(Boolean).filter((file) => !allowed(file));
  if (changed.length) throw new Error(`Only this edition's outputs may differ from origin/master when publishing; merge site changes through a PR first: ${changed.join(', ')}`);
  return 'current';
}

/** New drafts only: published issues keep their reviewed bytes on retry. */
export function assertNoBurnedInAiLabel(issue) {
  for (const story of issue.stories) {
    if (requestsBurnedInLabel(story.image_provenance?.prompt || '')) throw new Error(`Do not render an AI-generated label inside the infographic; the edition discloses generated graphics once: ${story.title}`);
  }
  return issue;
}

export function validateDailyDraft(raw, dates, history = []) {
  const issue = observabilityIssueSchema.parse(raw);
  if (issue.date !== dates.date || issue.story_window !== dates.storyWindow) throw new Error('Draft does not match the frozen run dates');
  if (issue.research?.status !== 'complete' || !['hn', 'news', 'github'].every((source) => issue.research.completed_sources?.includes(source))) throw new Error('All three source checks must be complete; failed research is not an empty issue');
  if (!Array.isArray(issue.research.checked_urls) || !issue.research.checked_urls.length) throw new Error('Record the official News surfaces checked');
  const urls = new Set();
  for (const story of issue.stories) {
    if (typeof story.dedupe_key !== 'string' || !story.dedupe_key.trim()) throw new Error(`Story needs a stable original-event dedupe key: ${story.title}`);
    const evidence = story.source_evidence;
    if (!evidence || evidence.publication_date !== dates.storyWindow || typeof evidence.method !== 'string' || !evidence.method.trim() || !/^https?:\/\//.test(evidence.url || '')) throw new Error(`Missing primary publication evidence: ${story.title}`);
    if (urls.has(story.url)) throw new Error(`Duplicate primary story URL: ${story.url}`);
    urls.add(story.url);
    if (typeof evidence.raw_date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(evidence.raw_date) || evidence.raw_date.slice(0, 10) !== dates.storyWindow || !Number.isFinite(Date.parse(evidence.raw_date))) throw new Error(`Original source date is outside the window: ${story.title}`);
    if (story.interest_score !== undefined && !(typeof story.score_reason === 'string' && story.score_reason.trim())) throw new Error(`Signal score needs an editorial reason: ${story.title}`);
    const words = story.body?.join(' ').trim().split(/\s+/).length || 0;
    if (story.format === 'brief') {
      if (words < 60 || typeof story.brief_reason !== 'string' || !story.brief_reason.trim()) throw new Error(`A brief needs substantive text and a source-specific reason: ${story.title}`);
    } else if (words < 130) throw new Error(`Full story needs at least 130 body words: ${story.title}`);
    if (!story.image || !new RegExp(`^/edition-images/${dates.date}/[a-z0-9][a-z0-9-]*\\.webp$`).test(story.image)) throw new Error(`Every story, including briefs, needs its own local WebP infographic: ${story.title}`);
    if (!story.image_provenance || !story.image_provenance.based_on.includes(evidence.url) || story.image_provenance.generator !== 'built-in-imagegen') throw new Error(`Infographic needs reviewed built-in generation provenance: ${story.title}`);
  }
  assertNoDuplicateStories(issue, history);
  return issue;
}

/** Inspect actual optimized WebP assets; declarations alone cannot satisfy the publication gate. */
export async function validateStoryImages(issue, directory) {
  if (!issue.stories.length) return [];
  const seen = new Set();
  const root = await realpath(directory);
  const assets = [];
  for (const story of issue.stories) {
    const filename = path.basename(story.image);
    const file = path.join(root, filename);
    if ((await lstat(file)).isSymbolicLink() || path.dirname(await realpath(file)) !== root) throw new Error(`Image must be a real file in the designated asset directory: ${filename}`);
    const data = await readFile(file);
    await validateNewspaperImage(data, filename, story);
    const hash = createHash('sha256').update(data).digest('hex');
    if (hash !== story.image_provenance.sha256) throw new Error(`Infographic changed after its recorded review: ${filename}`);
    if (seen.has(hash)) throw new Error(`Each story needs a distinct infographic; reused asset: ${filename}`);
    seen.add(hash);
    assets.push({ file, relative: story.image.slice(1) });
  }
  return assets;
}

export async function workspaceFingerprint(repo) {
  const files = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  const hash = createHash('sha256');
  for (const name of [...new Set(files)].sort()) {
    hash.update(name);
    try {
      const file = path.join(repo, name);
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) hash.update(`symlink:${await readlink(file)}`);
      else if (stat.isDirectory()) throw new Error(`Unsupported tracked directory/submodule: ${name}`);
      else hash.update(await readFile(file));
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('<missing>'); }
  }
  return hash.digest('hex');
}

export function canonicalStoryUrl(value) {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.protocol = 'https:';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid|ref)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function storyIdentities(story) {
  const aliases = [story.url, story.canonical_url, story.source_evidence?.url].filter(Boolean).map((url) => `url:${canonicalStoryUrl(url)}`);
  if (story.hn_id) aliases.push(`hn:${story.hn_id}`);
  if (story.dedupe_key) aliases.push(`event:${story.dedupe_key.trim().toLowerCase()}`);
  if (story.title) aliases.push(`title:${story.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`);
  return aliases;
}

export function assertNoDuplicateStories(issue, history = []) {
  const seen = new Map();
  for (const previous of history) {
    if (previous.date === issue.date) continue;
    for (const story of previous.stories) {
      for (const identity of storyIdentities(story)) seen.set(identity, `${previous.date}: ${story.title}`);
    }
  }
  for (const story of issue.stories) {
    const aliases = storyIdentities(story);
    for (const identity of aliases) {
      if (seen.has(identity)) throw new Error(`Duplicate story: ${story.title}; already recorded in ${seen.get(identity)}`);
    }
    for (const identity of aliases) seen.set(identity, `${issue.date}: ${story.title}`);
  }
}
