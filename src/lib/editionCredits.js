/**
 * Single source of truth for edition credits and AI-image disclosure.
 * The masthead shows the byline; generated graphics are disclosed once per
 * edition (visually hidden), never as a visible caption under each image.
 */
export const EDITION_AUTHOR = { name: 'Soumendra Kumar Sahoo', url: 'https://soumendrak.com' };
export const AI_IMAGE_DISCLOSURE = 'Story infographics in this edition are AI-generated editorial illustrations based on the linked sources.';

export const isGeneratedImage = (story) => story.image_provenance?.kind === 'generated-editorial';

/** Visible caption: attribution for real source images only. */
export function imageCaptionFor(story) {
  if (!story.image || isGeneratedImage(story)) return undefined;
  return `Source image · ${story.publisher}`;
}
