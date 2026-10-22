import { createHash } from 'node:crypto';

/** A source identity survives headline edits and changes to story ordering.
 * @param {{ url: string }} story
 */
export function storyAnchor(story) {
  const url = new URL(story.url);
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return `story-${createHash('sha256').update(url.href).digest('hex').slice(0, 16)}`;
}
