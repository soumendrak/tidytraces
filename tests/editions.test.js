import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationStreaks } from '../src/lib/publicationStreaks.js';
import { observabilityIssueSchema } from '../src/lib/observabilitySchema.js';
import { matchesStoryFilters, resolveStoryImage } from '../src/lib/storyFilters.js';
import { latestIssueFeeds } from '../src/lib/latestIssueFeeds.js';

const story = { title: 'AI tracing update', publisher: 'Original source', url: 'https://example.com/story', published: '2026-10-12', category_key: 'agents', summary: 'Source claim.', takeaway: 'Editorial context.' };
const issue = { date: '2026-10-13', story_window: '2026-10-12', dek: 'Current issue.', stories: [story] };

test('publication streaks handle gaps, duplicates, leap days and month boundaries', () => {
  assert.deepEqual(publicationStreaks([]), { latest: 0, longest: 0 });
  assert.deepEqual(publicationStreaks(['2024-03-01', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-04']), { latest: 1, longest: 3 });
  assert.deepEqual(publicationStreaks(['2025-12-31', '2026-01-01']), { latest: 2, longest: 2 });
  assert.throws(() => publicationStreaks(['2026-02-30']), /Invalid publication date/);
});

test('source tabs are mutually exclusive and signal filters require recorded scores', () => {
  assert.equal(matchesStoryFilters('news', undefined, 'news', 'all'), true);
  assert.equal(matchesStoryFilters('news', undefined, 'news', '8'), false);
  assert.equal(matchesStoryFilters('github', 9, 'hn', 'all'), false);
  assert.equal(matchesStoryFilters('hn', 9, 'hn', '8'), true);
  assert.equal(matchesStoryFilters('github', 8, 'github', '9'), false);
  assert.equal(matchesStoryFilters('news', 10, 'news', '9'), true);
  for (const source of ['hn', 'news', 'github']) {
    assert.equal(matchesStoryFilters(source, undefined, 'all', 'all'), true);
    assert.equal(matchesStoryFilters(source, 9, 'all', '9'), true);
    assert.equal(matchesStoryFilters(source, 7, 'all', '8'), false);
  }
});

test('AI publication gate rejects older stories and incorrect windows; empty issues are valid', () => {
  assert.equal(observabilityIssueSchema.parse(issue).stories[0].source, 'news');
  assert.equal(observabilityIssueSchema.safeParse({ ...issue, story_window: '2026-10-11' }).success, false);
  assert.equal(observabilityIssueSchema.safeParse({ ...issue, stories: [{ ...story, published: '2026-10-11' }] }).success, false);
  assert.equal(observabilityIssueSchema.safeParse({ ...issue, date: '2026-02-30' }).success, false);
  assert.equal(observabilityIssueSchema.safeParse({ ...issue, stories: [] }).success, true);
  assert.equal(observabilityIssueSchema.safeParse({ ...issue, stories: [{ ...story, source: 'engineering' }] }).success, false);
});

test('explicit image references are preserved, with no fabricated image for text-only stories', () => {
  assert.equal(resolveStoryImage(undefined), null);
  assert.equal(resolveStoryImage('https://example.com/original.jpg'), 'https://example.com/original.jpg');
  assert.equal(resolveStoryImage('/images/local.jpg'), '/images/local.jpg');
  assert.equal(resolveStoryImage('/infographics/original.jpg'), 'https://tdd-edge.b-cdn.net//infographics/original.jpg');
});

test('machine-readable exports use the AI issue and preserve separate source and editorial text', () => {
  const parsed = observabilityIssueSchema.parse(issue);
  const feeds = latestIssueFeeds(parsed);
  assert.equal(JSON.parse(feeds.json).canonical_url, 'https://tidytraces.com/');
  assert.equal(JSON.parse(feeds.json).date, issue.date);
  assert.equal(JSON.parse(feeds.json).dek, issue.dek);
  assert.ok(!feeds.markdown.includes(issue.dek), 'the edition summary stays in metadata, not before the stories');
  assert.match(feeds.markdown, /Source claim\./);
  assert.match(feeds.markdown, /Why it matters: Editorial context\./);
  assert.match(latestIssueFeeds({ ...parsed, stories: [] }).markdown, /No qualifying stories/);
});

test('discovery does not equate an HN submission with an original publication date', async () => {
  const { hnCandidate, githubReleaseCandidate } = await import('../src/lib/sourceCandidates.js');
  const item = { id: 123, type: 'story', title: 'Tracing an AI agent', time: Date.parse('2026-10-12T12:00:00Z') / 1000, score: 5, by: 'author', url: 'https://example.com/old-post' };
  const candidate = hnCandidate(item, '2026-10-12');
  assert.equal(candidate.original_publication_date, null);
  assert.equal(candidate.requires_editorial_review, true);
  assert.equal(hnCandidate({ ...item, dead: true }, '2026-10-12'), null);
  assert.equal(hnCandidate(item, '2026-10-13'), null);
  const release = { html_url: 'https://github.com/example/trace/releases/tag/v1', name: 'v1', published_at: '2026-10-12T14:00:00Z' };
  assert.equal(githubReleaseCandidate('example/trace', release, '2026-10-12').original_publication_date, '2026-10-12');
  assert.equal(githubReleaseCandidate('example/trace', { ...release, prerelease: true }, '2026-10-12'), null);
  assert.equal(githubReleaseCandidate('example/trace', release, '2026-10-13'), null);
});
