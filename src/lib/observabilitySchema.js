import { z } from 'astro/zod';

export const observabilityIssueSchema = z.looseObject({
    date: z.iso.date(),
    story_window: z.iso.date(),
    dek: z.string(),
    stories: z.array(z.looseObject({
      title: z.string(),
      url: z.url(),
      publisher: z.string(),
      published: z.iso.date(),
      category_key: z.enum(['observability', 'evals', 'agents']),
      summary: z.string(),
      body: z.array(z.string().min(1)).min(1).optional(),
      format: z.enum(['full', 'brief']).optional(),
      brief_reason: z.string().optional(),
      takeaway: z.string(),
      image: z.string().optional(),
      image_width: z.number().int().positive().optional(),
      image_height: z.number().int().positive().optional(),
      image_animation: z.looseObject({
        src: z.string().startsWith('/edition-images/').endsWith('.gif'),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        alt: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }).optional(),
      image_provenance: z.looseObject({
        kind: z.literal('generated-editorial'),
        generator: z.string().min(1),
        prompt: z.string().min(1),
        based_on: z.array(z.url()).min(1),
        reviewed: z.literal(true),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }).optional(),
      source: z.enum(['hn', 'news', 'github']).default('news'),
      interest_score: z.number().int().min(0).max(10).optional(),
      hn_id: z.string().optional(),
      comments: z.url().optional(),
    })),
  }).superRefine((issue, ctx) => {
    const previousDay = new Date(`${issue.date}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    if (previousDay.toISOString().slice(0, 10) !== issue.story_window) {
      ctx.addIssue({ code: 'custom', message: 'story_window must be the previous day' });
    }
    for (const story of issue.stories) {
      if (story.published !== issue.story_window) {
        ctx.addIssue({ code: 'custom', message: `Out-of-window story: ${story.title}` });
      }
    }
  });
