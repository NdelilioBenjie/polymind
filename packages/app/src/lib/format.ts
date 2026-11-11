import type { ModelInfo } from "../types";

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function formatContext(tokens: number): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M context`;
  return `${Math.round(tokens / 1000)}K context`;
}

const trim = (value: number): string => {
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return String(Number(value.toFixed(2)));
  return String(Number(value.toPrecision(2)));
};

export function formatPrice(model: Pick<ModelInfo, "free" | "promptPrice" | "completionPrice">): string {
  if (model.free) return "Free";
  return `$${trim(model.promptPrice)} in, $${trim(model.completionPrice)} out per 1M tokens`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function titleFrom(prompt: string): string {
  const line = prompt.replace(/\s+/g, " ").trim();
  return line.length > 52 ? `${line.slice(0, 50).trimEnd()}…` : line || "New chat";
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Buckets a timestamp for the conversation list. */
export function dayLabel(timestamp: number, now = Date.now()): string {
  const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

/** Each slot in a comparison gets its own colour, so a model keeps one
 *  identity from the composer chip to the answer column. */
export const VOICES = ["rose", "amber", "jade", "azure"] as const;
export const voiceOf = (index: number): string => VOICES[index % VOICES.length];
