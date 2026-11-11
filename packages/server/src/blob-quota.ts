import { getStore } from "@netlify/blobs";
import { createQuota, type Quota } from "./quota.ts";

const ATTEMPTS = 6;

/** Allowance counters kept in Netlify Blobs, so they hold across edge locations.
 *  Updates use compare-and-swap, so simultaneous requests cannot share a slot. */
export function blobQuota(): Quota {
  const store = getStore({ name: "polymind-allowance", consistency: "strong" });

  const update = async (key: string, next: (current: number) => number | null): Promise<number | null> => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const entry = await store.getWithMetadata(key);
      const current = Number(entry?.data) || 0;
      const value = next(current);
      if (value === null) return null;
      const result = entry?.etag
        ? await store.set(key, String(value), { onlyIfMatch: entry.etag })
        : await store.set(key, String(value), { onlyIfNew: true });
      if (result.modified) return value;
    }
    // Could not win the race: refuse rather than hand out an uncounted answer.
    return null;
  };

  return createQuota({
    increment: (key, limit) => update(key, (current) => (current >= limit ? null : current + 1)),
    decrement: async (key) => void (await update(key, (current) => Math.max(0, current - 1))),
  });
}
