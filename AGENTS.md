# Agent Instructions & Conventions

Tidy Traces is an AI-observability-only fork of https://github.com/arpitbbhayani/the-daily-diff. Preserve the original manifesto: distraction-free reading, depth over noise, original sources, useful summaries, and stable newspaper typography.

- AI Observability opens at `/` on `https://tidytraces.com`. There is no engineering edition or engineering navigation tab.
- Use the original newspaper reader in `src/components/EditionPage.astro`; do not create an unrelated landing-page design.
- Keep all real AI issues in `src/data/ai-observability/`. Dated routes are `/ai-observability/YYYY-MM-DD/`; `/archive/` is the calendar. Never remove previous AI issues when adding a new one.
- HN, NEWS, GITHUB are mutually exclusive source tabs, ordered exactly that way. They are discovery channels for AI-observability stories, not separate engineering topics. Default to All, which combines HN, NEWS, and GITHUB; source-specific buttons remain mutually exclusive.
- Signal filters are All, Recommended (recorded `interest_score` >= 8), Must-Read (>= 9). Missing scores appear only under All; never invent scores to populate filters.
- Calendars show consecutive publication dates, not inferred personal reading streaks. Do not fabricate issues to fill gaps.
- Every newly generated daily story, including every brief, requires its own reviewed AI-generated editorial infographic. Use built-in image generation only; stop if unavailable. Keep original PNGs in run evidence; publish reviewed local WebPs at most 300 KB each, with final dimensions, generation provenance, and SHA-256. Use `node scripts/optimize-newspaper-image.js INPUT_IMAGE OUTPUT.webp`. Disclose generated work once per edition via the template's visually hidden disclosure (`src/lib/editionCredits.js`); never add a visible per-image AI caption or render an AI-generated label inside the image. Preserve attribution for existing source images. Legacy `/infographics/` paths use the upstream CDN. Never borrow unrelated graphics.
- `npm run fetch:sources -- --date YYYY-MM-DD` discovers HN submissions and GitHub watchlist releases. The manually triggered discovery workflow uploads candidates for review; it never silently publishes them. HN submission time alone does not prove original article publication date.
- Daily curation uses `skills/ai-observability-newspaper` and `scripts/run-daily-newspaper.js`. The runner publishes verified editions automatically when invoked; do not activate a schedule without a request. Freeze the previous-day `story_window`, or the explicit news-day override. Verify original publication evidence, never modification/resurfacing dates, and deduplicate within each issue and across all history. Empty issues require completed source checks.
- Write full `body` paragraphs, normally 150–220 words (at least 130 for full stories). A source-specific reason may justify a 60+ word brief; it still requires an infographic. Keep editorial takeaways distinct and never pad with invented facts.
- Build selects the latest issue for `/`, `/md`, `/json`, and RSS, while preserving dated pages. `.github/workflows/verify.yml` checks PRs and master pushes; it does not curate stories or deploy.
- Styles use SASS newsprint theme variables in `src/styles/main.scss`.
- The masthead carries the byline "By Soumendra Kumar Sahoo" from `src/lib/editionCredits.js`. `tests/edition-presentation.test.js` builds every edition and fails if the byline leaves the top or a visible per-image AI caption returns.
- Start development in background mode: `npm run dev -- --background`. Manage with `npx astro dev status`, `npx astro dev logs`, `npx astro dev stop`.
- Before committing: `npm test`, `npm run check`, `npm run build`.
- `npm run preview:cf` previews Worker static assets. The Cloudflare Pages project `the-daily-diff` deploys every push to `master` (Git integration), and the daily runner also deploys a clean `master` build. Site changes must be merged to `master` through a PR; anything deployed ad hoc from an uncommitted tree or unmerged branch is reverted by the next daily deploy. `npm run deploy` refuses a dirty tree or any HEAD other than the freshly fetched `origin/master` tip.
- Canonical origin is fixed at `https://tidytraces.com`; an old dashboard `SITE_URL` value must not change it.

Astro reference: https://docs.astro.build
