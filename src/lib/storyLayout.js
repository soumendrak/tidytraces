export const MIN_STORIES_AFTER_FEATURE = 3;

/** @param {number} index @param {number} count */
export function leavesRoomAfterFeature(index, count) {
  return count - index - 1 >= MIN_STORIES_AFTER_FEATURE;
}
