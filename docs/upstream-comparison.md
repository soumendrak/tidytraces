# Upstream comparison and repair

Inspected on 2026-10-14. References: [tdd.cat](https://tdd.cat/) and [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). `ttd.cat` in the request appears transposed; the supplied repository identifies `tdd.cat` as its site.

Final scope: **AI observability only**, using the original newspaper reader with HN/NEWS/GITHUB source tabs, All/Recommended/Must-Read signals, images, a calendar, publishing streaks, and dated AI issues. No engineering edition or engineering navigation tab.

## Evidence and root causes

| Inspected evidence | Finding | Final repair |
| --- | --- | --- |
| Live `tidytraces.com/` versus `tdd.cat/` | Both rendered the engineering newspaper. The first four sampled infographic URLs were identical and loaded in both. HN showed 16 stories; the complete issue contained 21. | Reuse the upstream reader structure for AI observability at the root. Engineering content is excluded per the clarified scope. |
| Live `tidytraces.com/ai-observability/` and its source | A separate audit-first template had no calendar or image rendering. Its JSON had no images. | Reuse the newspaper component and original typography. Put stories first; collapse editorial method below them. Render explicitly sourced images without inventing substitutes. |
| Local workspace at task start | The earlier instruction to remove engineering and history had removed archive infrastructure and most shared styles. These changes were uncommitted and undeployed. | Restore the original design infrastructure, add an AI-specific calendar, and preserve all future AI history. Keep engineering content removed. |
| Fork remote `c86b259`, PR #4 | The automation-labelled PR changed date labels and README copy only; no publishing workflow was added. GitHub Actions listed zero workflows. | Add validation/build CI and a manually triggered HN/GitHub candidate-discovery workflow. Verify original publication dates and editorial relevance before publishing; date relabelling alone creates no issue. |
| Live fork canonical metadata | The root canonical pointed at `https://the-daily-diff-byn.pages.dev/`. | Fix canonical origin in code to `https://tidytraces.com`, so the stale build environment override cannot win. |
| Upstream master `8929dc14b39c15f6c78ab875a4b0d392e1be2971` | Upstream engineering JSON matched the fork’s committed data: 104 editions, latest 2026-10-12. No later engineering JSON was available. | Do not confuse engineering history with missing AI editions. One real AI issue exists; no older issues are fabricated or imported from an unrelated beat. |

## Why updates were missing

The fork added a separate AI page instead of extending `src/components/EditionPage.astro`. The new template never implemented the original reader’s calendar, image handling, or source/signal controls. Changing date text did not create an ingestion or publishing process.

This is a static site. A new AI issue must be curated, saved to the repository, validated, built, and published. Earlier local code changes were not committed or deployed, so the live site still showed its previous build. Local Wrangler was unauthenticated; Cloudflare dashboard build settings were not available to inspect.

## Final behavior

- `/` opens AI Observability Daily using the original newspaper reader.
- HN, NEWS, GITHUB are discovery sources within AI observability. The All Section is selected initially, combining all sources. The revised issue has 2 verified HN stories, 11 official news stories, and 2 GitHub release stories.
- All, Recommended, Must-Read filter recorded signal scores. Unrated stories stay in All. Recommended uses >= 8 and Must-Read >= 9; scores are not fabricated.
- `/archive/` is the AI publication calendar, with issue counts and latest/longest publishing streaks. These are consecutive publication dates, not personal reading activity.
- `/ai-observability/YYYY-MM-DD/` retains each real AI issue. Previous/next navigation and RSS history grow as issues are added. There is currently one real AI issue.
- Original image URLs are preserved when present. Legacy `/infographics/` paths resolve through the original CDN. The revised issue uses the Claude dashboard article’s original screenshot, attributed to its source. No same-URL article matched upstream’s engineering infographics, so unrelated graphics were not borrowed. The subsequent daily-skill contract now requires a distinct, disclosed, source-grounded generated infographic for every story, including briefs, and full story text matching upstream depth; the legacy issue has not yet been regenerated to that contract. Broken images do not leave a permanent loading placeholder.
- `/md` and `/json` now export the AI issue rather than the removed engineering edition.
- The build enforces the previous-day publication gate, valid categories/sources, optional signal-score ranges, and matching filenames/dates.

## Verification and publishing status

Verified locally: unit tests for streaks, source/signal boundaries, missing ratings, date gates, empty issues, image preservation, and AI exports; Astro type checks; production build; source and signal filter interactions; calendar-to-dated-issue navigation; root canonical metadata; responsive layout and theme toggle.

The workflows become active after their repository changes are merged. CI validates; daily source discovery uploads candidates from HN and a GitHub release watchlist. Editorial review and publishing are separate. Cloudflare Pages Git integration can publish master if configured. No production deployment was performed because local Wrangler authentication was unavailable. The repair is in this working tree; live behavior will change only after publishing it.

## Source-fetch repair

The original issue had 14 publisher-news stories, no `source` values for HN/GitHub, and no source-fetch script. Restoring UI tabs alone therefore left those channels blank. Live API checks found eligible stories that the original sweep had missed.

Included after primary-source review: [Claude observability dashboard](https://prakhargurunani.com/blog/building-claude-observability/) (article time element 2026-10-12; [HN discussion](https://news.ycombinator.com/item?id=50053675)), [Airlock first-party Show HN announcement](https://news.ycombinator.com/item?id=50054620), [Langfuse v4.57.0](https://github.com/langfuse/langfuse/releases/tag/v4.57.0), and [Phoenix v20.21.1](https://github.com/Arize-ai/phoenix/releases/tag/arize-phoenix-v20.21.1). GitHub release publication timestamps were confirmed through its API. Source evidence and reasons for editorial signal ratings are stored with each added story.

The fetch command produces dated candidates with source evidence and review requirements. It does not treat HN votes or GitHub stars as signal ratings, does not silently overwrite editorial issues, and fails on API errors. GitHub coverage is explicitly limited to stable releases from the configured watchlist.

Daily automation now lives in `skills/ai-observability-newspaper` and `scripts/run-daily-newspaper.js`. The October 12 issue excludes the user-disputed SRE book item and two DigitalOcean articles for which only modification dates could be verified. Conflicting dates are excluded rather than resolved by choosing a convenient field. No production publication or cron activation was performed.

Cloudflare account verification confirmed the live Pages project is named `the-daily-diff`, with domains `the-daily-diff-byn.pages.dev` and `tidytraces.com`, and no Git provider attached. A repository push alone therefore does not deploy this project. The daily runner now targets the verified project name.
