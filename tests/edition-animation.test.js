import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { observabilityIssueSchema } from '../src/lib/observabilitySchema.js';

test('October 22 animations decode, loop, fit their budget and retain reviewed static fallbacks', async () => {
  const issue = JSON.parse(await readFile(new URL('../src/data/ai-observability/2026-10-22.json', import.meta.url)));
  observabilityIssueSchema.parse(issue);
  assert.equal(issue.stories.length, 6);
  for (const story of issue.stories) {
    const animation = story.image_animation;
    assert.ok(animation, story.title);
    const gif = await readFile(new URL('../public' + animation.src, import.meta.url));
    assert.equal(createHash('sha256').update(gif).digest('hex'), animation.sha256);
    assert.ok(gif.length <= 300_000, `${story.title}: ${gif.length} bytes`);
    const info = await sharp(gif, { animated: true }).metadata();
    assert.equal(info.format, 'gif');
    assert.equal(info.width, animation.width);
    assert.equal(info.pageHeight, animation.height);
    assert.equal(info.pages, animation.frames);
    assert.equal(info.loop, 0);
    assert.equal(info.delay.reduce((n, v) => n + v, 0), animation.duration_ms);
    assert.ok(animation.duration_ms >= 12_000, 'reading time for four stages');
    const { data, info: raw } = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(raw.height === animation.height * info.pages, 'all frames fully decode');
    const frameBytes = animation.width * animation.height * 4;
    const unique = new Set(Array.from({ length: info.pages }, (_, i) => createHash('sha256').update(data.subarray(i * frameBytes, (i + 1) * frameBytes)).digest('hex')));
    assert.ok(unique.size >= 12, 'distinct mechanism states, not one static frame');
    const fallback = await readFile(new URL('../public' + story.image, import.meta.url));
    assert.equal(createHash('sha256').update(fallback).digest('hex'), story.image_provenance.sha256);
    assert.equal((await sharp(fallback).metadata()).format, 'webp');
  }
});
