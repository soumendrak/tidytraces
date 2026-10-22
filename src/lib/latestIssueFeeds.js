import { EDITION_AUTHOR, AI_IMAGE_DISCLOSURE, isGeneratedImage } from './editionCredits.js';

/** Produce only the selected AI observability issue; source claims stay separate from takeaways. */
export function latestIssueFeeds(edition) {
  const json = JSON.stringify({ ...edition, name: 'Tidy Traces — AI Observability Daily', canonical_url: 'https://tidytraces.com/' }, null, 2) + '\n';
  const markdown = `# AI Observability Daily — ${edition.date}\n\nBy ${EDITION_AUTHOR.name}\n\nCanonical: https://tidytraces.com/\nCoverage window: ${edition.story_window}\n\n${edition.dek}\n\n` +
    (edition.stories.length ? edition.stories.map((story) =>
      `## ${story.title}\n\nSource: ${story.publisher} — ${story.url}\nPublished: ${story.published}\nChannel: ${story.source}\n\n${(story.body || [story.summary]).join('\n\n')}\n\nWhy it matters: ${story.takeaway}\n${story.image ? `\n![${story.title}](${story.image})\n${isGeneratedImage(story) ? '' : `Source image: ${story.image_source || story.url}\n`}` : ''}`).join('\n') : 'No qualifying stories in this publication window.\n') +
    (edition.stories.some(isGeneratedImage) ? `\n---\n\n${AI_IMAGE_DISCLOSURE}\n` : '');
  return { json, markdown };
}
