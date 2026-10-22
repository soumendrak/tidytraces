import { EDITION_AUTHOR } from '../../src/lib/editionCredits.js';

const AI_TEXT = /\bAI[-\s]?generated\b/i;
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** Returns violations of the edition presentation contract for one rendered page. */
export function auditEditionHtml(html) {
  const problems = [];
  const body = html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const firstStory = body.search(/<article class="story[\s"]/);
  const masthead = body.match(/<header class="masthead"[\s\S]*?<\/header>/)?.[0] || '';
  const mastheadEnd = masthead ? body.indexOf(masthead) + masthead.length : -1;
  const byline = masthead.match(/<p class="edition-byline"[^>]*>([\s\S]*?)<\/p>/);
  if (!byline || !text(byline[1]).includes(`By ${EDITION_AUTHOR.name}`) || (firstStory >= 0 && mastheadEnd > firstStory)) {
    problems.push(`Missing author byline "By ${EDITION_AUTHOR.name}" in the masthead above the first story`);
  }
  const imageAreas = [
    ...body.matchAll(/<div class="story-image-wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/g),
    ...body.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g),
    ...body.matchAll(/<(\w+)[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/\1>/g),
  ];
  for (const area of imageAreas) {
    if (AI_TEXT.test(text(area.at(-1)))) problems.push(`Visible per-image AI caption: "${text(area.at(-1)).slice(0, 80)}"`);
  }
  const generatedImages = (body.match(/data-image-provenance="generated-editorial"/g) || []).length;
  const disclosures = [...body.matchAll(/<p\b[^>]*class="([^"]*\bai-image-disclosure\b[^"]*)"[^>]*>([\s\S]*?)<\/p>/g)];
  if (generatedImages && disclosures.length !== 1) problems.push(`Pages with AI-generated images need exactly one edition-level disclosure; found ${disclosures.length}`);
  for (const [, classes, content] of disclosures) {
    if (!/\bvisually-hidden\b/.test(classes)) problems.push('The edition-level AI disclosure must be visually hidden');
    if (!AI_TEXT.test(text(content))) problems.push('The edition-level AI disclosure must say the images are AI-generated');
  }
  return problems;
}
