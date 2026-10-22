# Unattended runner

A skill is the editorial procedure. Cron schedules a process; an authenticated agent executes the skill. This package includes a Codex CLI runner, with a configurable agent command for other runtimes. It does not activate a cron job merely by being installed.

## Commands

From the newspaper repository:

```sh
npm run newspaper:daily -- --news-date 2026-10-12 --dry-run
npm run newspaper:daily -- --mode build
npm run newspaper:daily -- --date 2026-10-14 --mode build
```

`--date` is the **edition date**, not its previous-day news window. `--news-date 2026-10-12` fixes the original news window at October 12 and derives the October 13 edition; it overrides the daily default and is mutually exclusive with `--date`. A normal rerun preserves an existing issue. `--dry-run` prints dates and commands without fetching, invoking a model, writing an issue, or publishing.

Edit `automation/daily-newspaper.json` for the agent executable, time zone, and optional publication command. Absolute executable paths work best in cron. The default mode publishes to the existing Pages project `the-daily-diff` (verified in Cloudflare; its hostname is `the-daily-diff-byn.pages.dev`); adjust the argv if the production target changes. Scheduling remains inactive until explicitly installed. The default Codex command enables live web search, a workspace-write sandbox with network access, and noninteractive execution; it reads the skill and frozen run inputs. It writes only a draft, source and original generation evidence, and reviewed, optimized WebP images (at most 300 KB each) under `.cache/daily-runs/`. Built-in image generation must be exposed to that agent runtime; a ChatGPT login alone does not prove tool availability. No API fallback is permitted. An unavailable tool or any missing/unreviewed infographic fails the run before publication. The runner validates/promotes it, tests, type-checks, and builds. A lock prevents overlapping runs. Each attempt has a fresh `.cache/daily-runs/EDITION-DATE/RUN-ID/` directory so a blocked attempt cannot publish an older draft. Model output and source-fetch logs stay there.

A successful unattended publish requires a clean, dedicated Git checkout and configured credentials. The runner commits only the new issue, its generated images, and regenerated `/md`/`/json` files so the checkout is clean for the next day. Application code and old issues are protected by a workspace fingerprint. It never automatically pushes unrelated commits. Because every daily publish deploys a clean `master` build (and the Pages project also deploys each push to `master`), site or template changes that were deployed ad hoc but never merged are reverted by the next run; ship them through a PR. In publish mode the runner fetches `origin/master`, fast-forwards a clean checkout that is behind and re-executes itself with the updated code, rechecks right before deploying, and refuses a diverged checkout or any non-edition change not on `origin/master`. `publish.command` is an argv array, not shell text. Configure either the existing Pages project or a Worker deployment deliberately; do not assume those targets are interchangeable.

Examples (run after authentication/configuration):

```json
{"command":["npx","wrangler","pages","deploy","dist","--project-name","YOUR-PAGES-PROJECT","--branch","master"]}
```

```json
{"command":["npx","wrangler","deploy"]}
```

For Pages/Workers API-token auth, provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the scheduler environment. An existing local Wrangler login can also work. Never put token values into the skill or committed configuration. Codex CLI must already be authenticated; a hosted runner should use its supported secret-based authentication instead of copying a local ChatGPT session.

## Cron

The local installer prints or installs a managed daily line at **08:00 in the host's local time zone**. On this Mac the host zone is IST, so the preceding UTC source day is complete. Other hosts must use an equivalent time after 00:00 UTC. The Mac must be awake and have network access; cron does not wake it.

```sh
node scripts/install-newspaper-cron.js --print
node scripts/install-newspaper-cron.js --install --mode build
node scripts/install-newspaper-cron.js --remove
```

Publishing mode needs a configured `publish.command` and clean checkout. The installer preserves unrelated crontab entries. It does not use `CRON_TZ` because that variable is not portable across macOS cron implementations. Use the supplied environment/PATH wrapper; normal interactive shell aliases are unavailable to cron.

## Direct skill invocation / other agents

`$ai-observability-newspaper Create today's issue from yesterday's verified news in this repository. Build it automatically.`

For a runner using another agent, set `agent.command` to its executable and argv. The runner sends the complete skill invocation through stdin, including the skill path, date window, candidate path, and designated draft path. The process must return nonzero on failure and must not modify unrelated files. A CLI that cannot consume stdin needs a small adapter; no shell interpolation is performed.

## Retry and failure behavior

- Overlap: return a temporary failure, rather than running two editors.
- Existing issue: validate/rebuild; skip research and preserve its bytes. Publishing can be retried without regenerating content.
- New draft missing/invalid, incomplete research, old publication dates, source failure, or agent failure: exit nonzero and preserve the prior homepage.
- Validation/build failure after promotion: remove only the newly created issue and promoted images, and restore the previous text exports. Keep the draft/logs for diagnosis.
- Deployment failure after a validated local commit: retain the issue and record publication failure. Retry publication for the same date; do not rewrite it.
- Missing authentication or runtime configuration: report the concrete failure. Do not fall back to publishing stale content or creating an invented empty issue.

The retained legacy October 13 issue is date-corrected but has not been regenerated under the new full-text/all-image contract. A normal retry must reject it rather than silently publish it as compliant. Replacing an existing issue requires an explicit editorial correction workflow.

Prerequisites before enabling a production job: commit/merge the repaired site and skill, install dependencies in a dedicated checkout, configure the publication command, and verify authentication and built-in image-tool availability with a real manual run. This package prepares the runner; it does not enable a schedule or certify a deployment.
