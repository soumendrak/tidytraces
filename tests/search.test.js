import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import MiniSearch from 'minisearch';
import { storyAnchor } from '../src/lib/storyAnchors.js';
import { SEARCH_OPTIONS, searchStories, resultPassage, resultHref, highlightParts } from '../src/lib/storySearch.js';

const documents = [
  { id: 'first', title: 'Agent telemetry', summary: 'Recoverable context', publisher: 'Source', body: 'Export OpenTelemetry traces with loss-free delivery.', takeaway: 'Replay ingestion failures.', source: 'hn', editionDate: '2026-10-13', href: '/ai-observability/2026-10-13/#story-first', passages: ['Export OpenTelemetry traces with loss-free delivery.', 'Replay ingestion failures.', 'Agent telemetry'] },
  { id: 'second', title: 'OpenTelemetry tracing', summary: 'Export spans', publisher: 'Source', body: 'A tracing integration.', takeaway: 'Replay the pipeline.', source: 'github', interest_score: 9, editionDate: '2026-10-15', href: '/ai-observability/2026-10-15/#story-second', passages: ['A tracing integration.', 'Replay the pipeline.', 'OpenTelemetry tracing'] },
];
const index = new MiniSearch(SEARCH_OPTIONS);
index.addAll(documents);

test('anchors survive headline, content, URL-fragment and ordering edits', () => {
  const before = { url: 'https://example.com/post/', title: 'Original title' };
  assert.equal(storyAnchor(before), storyAnchor({ ...before, title: 'New title' }));
  assert.equal(storyAnchor(before), storyAnchor({ url: 'https://example.com/post#heading' }));
  assert.notEqual(storyAnchor(before), storyAnchor({ url: 'https://example.com/other' }));
  for (const file of readdirSync(new URL('../src/data/ai-observability/', import.meta.url))) {
    const issue = JSON.parse(readFileSync(new URL(`../src/data/ai-observability/${file}`, import.meta.url)));
    assert.equal(new Set(issue.stories.map(storyAnchor)).size, issue.stories.length, file);
    assert.deepEqual(issue.stories.map(storyAnchor), [...issue.stories].reverse().map(storyAnchor).reverse());
  }
});

test('serialized search supports ranking, body text, summaries, publishers, prefix and fuzzy queries', () => {
  const loaded = MiniSearch.loadJSON(JSON.stringify(index), SEARCH_OPTIONS);
  assert.equal(searchStories(loaded, 'OpenTelemetry')[0].id, 'second', 'title matches rank above body matches');
  assert.equal(searchStories(loaded, 'ingestion failures')[0].id, 'first', 'takeaways are searchable');
  assert.equal(searchStories(loaded, 'recoverable')[0].id, 'first', 'summaries are searchable');
  assert.equal(searchStories(loaded, 'Source').length, 2, 'publishers are searchable');
  assert.equal(searchStories(loaded, 'opentelemet').length, 2, 'prefix matching');
  assert.equal(searchStories(loaded, 'opentelemtry').length, 2, 'typo tolerance');
  assert.equal(searchStories(loaded, 'opentelemetry nonexistent').length, 0, 'all query terms must match');
  assert.deepEqual(searchStories(loaded, ''), []);
  assert.deepEqual(searchStories(loaded, 'a'), []);
  assert.deepEqual(searchStories(loaded, '!!!'), []);
});

test('source, recorded signal and edition filters work across the index', () => {
  assert.equal(searchStories(index, 'OpenTelemetry', { source: 'hn' })[0].id, 'first');
  assert.equal(searchStories(index, 'OpenTelemetry', { source: 'news' }).length, 0);
  assert.equal(searchStories(index, 'OpenTelemetry', { signal: '8' })[0].id, 'second');
  assert.equal(searchStories(index, 'OpenTelemetry', { signal: '9' }).length, 1, 'unrated story excluded');
  assert.equal(searchStories(index, 'OpenTelemetry', { edition: '2026-10-13' })[0].id, 'first');
});

test('fuzzy result links use visible literal text with a stable anchor and encoded delimiters', () => {
  const result = searchStories(index, 'opentelemtry', { source: 'hn' })[0];
  const passage = resultPassage(result);
  assert.match(passage.fragment, /OpenTelemetry/);
  assert.equal(result.passages.some((text) => text.includes(passage.fragment)), true);
  const href = resultHref(result, passage.fragment);
  assert.match(href, /#story-first:~:text=/);
  assert.match(href, /loss%2Dfree/);
  assert.equal(decodeURIComponent(href.split(':~:text=')[1]), passage.fragment);
  const summaryOnly = searchStories(index, 'recoverable')[0];
  assert.equal(resultPassage(summaryOnly).fragment, '');
  assert.equal(resultHref(summaryOnly, ''), summaryOnly.href, 'unprinted summaries fall back to story anchors');
  const parts = highlightParts('<script>alert(1)</script> OpenTelemetry', ['opentelemetry']);
  assert.equal(parts.map((part) => part.text).join(''), '<script>alert(1)</script> OpenTelemetry');
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['OpenTelemetry']);
  assert.equal(highlightParts('tracing retracing', ['tracing']).filter((part) => part.match).length, 1);
});

test('text fragments avoid the floated initial letter without changing the excerpt', () => {
  const result = { ...searchStories(index, 'OpenTelemetry')[0], title: 'OpenTelemetry tracing', terms: ['opentelemetry'], passages: ['OpenTelemetry exports traces.', 'OpenTelemetry tracing'] };
  assert.equal(resultPassage(result).text, 'OpenTelemetry exports traces.');
  assert.equal(resultPassage(result).fragment, 'OpenTelemetry tracing', 'headline is safe when the only match crosses the floated initial');
  const bodyMatch = { ...result, passages: ['Export OpenTelemetry traces.', result.title] };
  assert.equal(resultPassage(bodyMatch).fragment, 'OpenTelemetry traces.');
});
