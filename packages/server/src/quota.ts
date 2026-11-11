/** Daily allowance of paid answers, counted per visitor and across the site. */

export interface QuotaResult {
  allowed: boolean;
  /** Paid answers this visitor has left today, after this request. */
  remaining: number;
  /** Which ceiling refused the request. */
  reason?: "visitor" | "site";
}

export interface Quota {
  take(visitor: string, perVisitor: number, siteTotal: number): Promise<QuotaResult>;
  /** Gives one answer back, for requests that failed before producing anything. */
  refund(visitor: string): Promise<void>;
}

/** Minimal counter contract. Both operations must be atomic, because one
 *  prompt sent to several models arrives as several simultaneous requests. */
export interface CounterStore {
  /** Adds one unless the counter already reached `limit`. Returns the new count, or null if refused. */
  increment(key: string, limit: number): Promise<number | null>;
  decrement(key: string): Promise<void>;
}

export const today = (): string => new Date().toISOString().slice(0, 10);

export async function visitorKey(visitor: string): Promise<string> {
  // Store a hash, never the address itself.
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`polymind:${visitor}`));
  return [...new Uint8Array(bytes).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createQuota(store: CounterStore, day: () => string = today): Quota {
  const keys = async (visitor: string) => {
    const date = day();
    return { own: `${date}/${await visitorKey(visitor)}`, site: `${date}/site-total` };
  };

  return {
    async take(visitor, perVisitor, siteTotal) {
      const { own, site } = await keys(visitor);
      const used = await store.increment(own, perVisitor);
      if (used === null) return { allowed: false, remaining: 0, reason: "visitor" };
      if ((await store.increment(site, siteTotal)) === null) {
        await store.decrement(own);
        return { allowed: false, remaining: perVisitor - used + 1, reason: "site" };
      }
      return { allowed: true, remaining: perVisitor - used };
    },
    async refund(visitor) {
      const { own, site } = await keys(visitor);
      await Promise.all([store.decrement(own), store.decrement(site)]);
    },
  };
}

/** Process-local counters: used in development and as a last resort in production. */
export function memoryStore(): CounterStore {
  const counts = new Map<string, number>();
  return {
    async increment(key, limit) {
      const current = counts.get(key) ?? 0;
      if (current >= limit) return null;
      counts.set(key, current + 1);
      return current + 1;
    },
    async decrement(key) {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
    },
  };
}

export const memoryQuota: Quota = createQuota(memoryStore());
