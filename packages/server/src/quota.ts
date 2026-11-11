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

/** Minimal key-value contract so the counter logic can be tested without a real store. */
export interface CounterStore {
  get(key: string): Promise<number>;
  set(key: string, value: number): Promise<void>;
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
      const [used, total] = await Promise.all([store.get(own), store.get(site)]);
      if (used >= perVisitor) return { allowed: false, remaining: 0, reason: "visitor" };
      if (total >= siteTotal) return { allowed: false, remaining: perVisitor - used, reason: "site" };
      await Promise.all([store.set(own, used + 1), store.set(site, total + 1)]);
      return { allowed: true, remaining: perVisitor - used - 1 };
    },
    async refund(visitor) {
      const { own, site } = await keys(visitor);
      const [used, total] = await Promise.all([store.get(own), store.get(site)]);
      await Promise.all([store.set(own, Math.max(0, used - 1)), store.set(site, Math.max(0, total - 1))]);
    },
  };
}

/** Process-local counters: used in development and as a last resort in production. */
export function memoryStore(): CounterStore {
  const counts = new Map<string, number>();
  return {
    get: async (key) => counts.get(key) ?? 0,
    set: async (key, value) => void counts.set(key, value),
  };
}

export const memoryQuota: Quota = createQuota(memoryStore());
