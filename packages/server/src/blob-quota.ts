import { getStore } from "@netlify/blobs";
import { createQuota, type Quota } from "./quota.ts";

/** Allowance counters kept in Netlify Blobs, so they survive across edge locations. */
export function blobQuota(): Quota {
  const store = getStore({ name: "polymind-allowance", consistency: "strong" });
  return createQuota({
    get: async (key) => Number(await store.get(key)) || 0,
    set: async (key, value) => void (await store.set(key, String(value))),
  });
}
