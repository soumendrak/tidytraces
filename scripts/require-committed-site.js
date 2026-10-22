// Production must only ever serve what master builds. Ad-hoc deploys from an
// uncommitted, unmerged or stale tree were silently replaced by the next clean
// master deploy (the Pages project also deploys every push to master).
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (message) => { console.error(`Refusing to deploy: ${message}`); process.exit(1); };

if (git('status', '--porcelain')) fail('the working tree has uncommitted changes. Commit them and merge to master first, or the next daily deploy reverts them.');
try { git('fetch', '--quiet', 'origin', 'master'); } catch { fail('could not fetch origin/master to confirm this is the current production source.'); }
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/master')) fail('HEAD is not the current origin/master tip. Merge your PR and deploy from an up-to-date master; anything else is reverted or rolls production back.');
