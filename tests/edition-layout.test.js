import test from 'node:test';
import assert from 'node:assert/strict';
import { leavesRoomAfterFeature, MIN_STORIES_AFTER_FEATURE } from '../src/lib/storyLayout.js';

test('a feature only spans the sheet when enough stories follow to fill the columns below it', () => {
  assert.equal(MIN_STORIES_AFTER_FEATURE, 3);
  assert.equal(leavesRoomAfterFeature(8, 10), false);
  assert.equal(leavesRoomAfterFeature(6, 10), true);
  assert.equal(leavesRoomAfterFeature(7, 10), false);
  assert.equal(leavesRoomAfterFeature(2, 4), false);
});
