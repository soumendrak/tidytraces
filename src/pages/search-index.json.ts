import { getCollection } from 'astro:content';
import MiniSearch from 'minisearch';
import { SEARCH_OPTIONS } from '../lib/storySearch.js';
import { storyAnchor } from '../lib/storyAnchors.js';

export async function GET() {
  const editions = await getCollection('observability');
  const index = new MiniSearch(SEARCH_OPTIONS);
  index.addAll(editions.flatMap(({ data: edition }) => edition.stories.map((story) => {
    const href = `/ai-observability/${edition.date}/#${storyAnchor(story)}`;
    const body = story.body || [story.summary];
    return {
      id: href,
      href,
      title: story.title,
      summary: story.summary,
      body: body.join('\n\n'),
      publisher: story.publisher,
      takeaway: story.takeaway,
      editionDate: edition.date,
      source: story.source,
      interest_score: story.interest_score,
      passages: [...body, story.takeaway, story.title],
    };
  })));
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
