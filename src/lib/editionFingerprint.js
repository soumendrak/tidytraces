import { createHash } from 'node:crypto';

/** Stable across JSON key order; changes whenever any curated edition content changes. */
export function editionFingerprint(edition) {
  const canonical = JSON.stringify(edition, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
  });
  return createHash('sha256').update(canonical).digest('hex');
}
