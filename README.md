# Tidy Traces — AI Observability Daily

An **AI-observability-only** publication using the distraction-free newspaper reader from [The Daily Diff](https://github.com/arpitbbhayani/the-daily-diff), by [Arpit Bhayani](https://arpitbhayani.me/). Preserve the original reader’s typography, source tabs, signal filters, images, date navigation, and calendar. The latest AI issue opens directly at **https://tidytraces.com/**; there is no engineering edition or engineering tab.

## Reading

- Latest issue: `/`
- Publication calendar and streaks: `/archive/`
- Dated issue: `/ai-observability/YYYY-MM-DD/`
- RSS history: `/rss.xml`
- Latest Markdown and JSON: `/md` and `/json`
- Printable A4 PDF: use **PDF** in any edition's masthead, or `/pdf/YYYY-MM-DD.pdf`
- Latest PDF: `/pdf/latest.pdf` (also `/latest.pdf`)

**All / HN / NEWS / GITHUB** are Section buttons. All combines every discovery channel; individual source buttons are mutually exclusive. All stories still belong to AI observability. The All Section opens by default, combining HN, News, and GitHub. **All / Recommended / Must-Read** are signal filters: Recommended requires a recorded score of at least 8, Must-Read at least 9. Unrated stories appear under All. Signal scores are editorial judgements with recorded reasons; they are independent of vote/star counts. Unrated publisher stories remain in All.

The calendar shows publication streaks, not personal reading activity. Only real, sourced AI issues appear; missing editions are not fabricated. Previous issues stay available when new editions are added. The old `/ai-observability/` landing URL redirects to `/`.

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev -- --background
```

Open http://localhost:4321/. Manage the background server with `npx astro dev status`, `npx astro dev logs`, and `npx astro dev stop`.

```sh
npm test
npm run check
npm run build
npm run preview
```

## PDF editions

`npm run build` generates PDFs for **every real AI observability edition**, including the latest aliases, in `dist/`. They deploy with the site on Cloudflare Pages; no separate storage account, upstream CDN upload, or credentials are needed. Historical pages always download their own date. PDFs use the existing warm newsprint theme, A4 pages with 18 mm margins, full story text, infographics, source links, and the masthead byline. An empty issue keeps its publication-window explanation.

To regenerate files after a successful build:

```sh
npm run generate-pdf                         # latest edition and latest aliases
npm run generate-pdf -- --day 2026-10-14    # one historical edition
npm run generate-pdf -- --all               # every edition
npm run generate-pdf -- --no-upload         # accepted for upstream compatibility; always local
```

PDF generation uses Puppeteer and its downloaded Chrome, installed by `npm ci`. If browser downloads were skipped, run `npx puppeteer browsers install chrome`, or set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome/Chromium executable. Linux build images must include Chrome's system dependencies (see [Puppeteer troubleshooting](https://pptr.dev/troubleshooting)). Missing editions, stale build dates/story counts, and failed image loads stop generation instead of publishing an incomplete PDF. Build files are generated into `dist/`, not committed or copied back into `public/`; use `npm run preview` to test production PDF downloads locally.

With `just dev` or `npm run dev -- --background`, the same PDF button generates the requested edition directly from the live reader. No production build is required. Allow a few seconds for Chrome to render the download. Development PDFs are kept in memory, so downloads do not write into watched source folders or restart the server. Failed generation returns an error response while the server keeps running.

## Content updates

Add a dated JSON file in `src/data/ai-observability/` and **keep prior issues**. The homepage, calendar, date navigation, RSS, Markdown, and JSON update on the next build. Each issue must declare the previous-day `story_window`; original story publication dates must match it. Categories are `observability`, `evals`, and `agents`; sources are `hn`, `news`, and `github` (default `news` for official publisher posts). An empty issue is valid when nothing qualifies.

Each story has a publisher, original URL, publication date, summary, full `body` paragraphs, and separate editorial takeaway. New full stories normally contain 150–220 words, with a 130-word minimum. Sparse sources may justify a 60+ word brief with a recorded reason. Optional `interest_score` is an integer 0–10 supported by editorial judgement; it must not be made up merely to fill filters. Optional `hn_id` or `comments` links to the source discussion. Every new daily story requires a distinct reviewed generated infographic, including briefs. The built-in image tool is the only permitted generator; unavailable generation stops the run. Optimized local WebPs (at most 300 KB each, up to 1440 pixels wide) and `image_provenance` travel with the edition. Generated graphics are disclosed once per edition (a visually hidden note), not with a visible caption under each image, and the masthead carries the author byline. Existing source images retain attribution; legacy `/infographics/` references use the upstream CDN.

Source discovery is now connected:

```sh
npm run fetch:sources -- --date 2026-10-12
```

Without a date, the command searches yesterday in UTC. It uses Algolia HN date search, verifies submissions against the official HN API, and checks stable GitHub releases in `src/data/source-config.json`. GitHub coverage is a maintained watchlist, not a global trending scan. Results are written to `.cache/source-candidates/YYYY-MM-DD.json`, with discussion URLs, source timestamps, HN metrics, and explicit review status. HN submission dates do not establish an older article's original publication date; check the primary article before including it. First-party Show HN announcements can use their original post date.

`.github/workflows/fetch-sources.yml` supports manual source discovery and uploads a candidate artifact. It has no active schedule. It uses the workflow's read-only GitHub token; local runs can use an existing `gh` login or public API access. Failed requests fail the job instead of being reported as an empty category. New sources can be added to the watchlist.

The reusable skill now performs research, relevance review, full story writing, ratings, and infographic generation. The outer runner validates, builds, commits edition outputs, and publishes automatically when invoked. Date-label changes do not create issues. A fork does not automatically inherit upstream commits, and upstream engineering content is intentionally excluded. `.github/workflows/verify.yml` verifies PRs and master pushes, including the publication-date gate. It does not fabricate daily content or deploy.

## Daily skill and runner

The portable skill lives in [skills/ai-observability-newspaper](skills/ai-observability-newspaper/SKILL.md). The runner is [scripts/run-daily-newspaper.js](scripts/run-daily-newspaper.js), configured in `automation/daily-newspaper.json`.

```sh
npm run newspaper:daily -- --news-date 2026-10-12 --dry-run
npm run newspaper:daily -- --mode build
npm run newspaper:daily
node scripts/install-newspaper-cron.js --print
```

Default mode publishes automatically to the configured existing Pages project. `--news-date` freezes the original publication day; without it, the edition covers yesterday. Strict date evidence, all-history deduplication, full text, and a reviewed infographic for every story are publication gates. Retrying a compliant existing issue preserves its bytes and images. Logs/drafts are kept in `.cache/daily-runs/`.

No cron job is activated by this change. A future scheduled run needs a clean dedicated checkout, Codex authentication, a runtime exposing built-in image generation, and Cloudflare credentials. Image API fallback is explicitly disabled. The legacy October 13 issue has been date-corrected but is not yet compliant with the new full-text/all-image contract; the runner will reject it rather than silently republish it. See [automation instructions](skills/ai-observability-newspaper/references/automation.md).

## Deployment

```sh
npm run preview:cf
npm run deploy
```

`npm run deploy` builds and uploads `dist` to the existing Cloudflare Pages project **the-daily-diff**, using production branch **master**. This project serves `tidytraces.com` and has no Git integration, so pushing to GitHub alone does not publish changes. Deployment requires Wrangler authentication with Pages write access. `npm run preview:cf` uses the Worker static-assets configuration for local previews.

Canonical URLs are fixed to `https://tidytraces.com` so an old Pages `SITE_URL` cannot override them. Remove any external redirect sending `/` to `/ai-observability/`. Google Analytics is disabled unless the fork configures its own `PUBLIC_GA_ID`; the upstream measurement ID is not reused.

See [the source and live-site comparison](docs/upstream-comparison.md) for the diagnosis and repair evidence.

## Sponsor

If this project helps you, consider [sponsoring my work on GitHub](https://github.com/sponsors/soumendrak). Your support helps fund maintenance, documentation, and continued development.
