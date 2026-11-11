import { corsHeaders, errorResponse, json, preflight, readSettings, type Env } from "./http.ts";

export interface PageExtract {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 20_000;
const MAX_REDIRECTS = 3;

/** Refuses anything that could point the server at a private network. */
export function isPublicHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;

  const host = url.hostname.toLowerCase();
  if (host.startsWith("[") || !host.includes(".")) return null; // IPv6 literal or bare name
  if (/\.(local|localhost|internal|lan|home|corp)$/.test(host)) return null;
  if (/^\d+(\.\d+){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    const isPrivate =
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    if (isPrivate) return null;
  }
  return url;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Reduces an HTML document to readable text. Deliberately dependency-free. */
export function extractReadableText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const text = decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let received = 0;
  let html = "";
  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return html;
}

/** POST /api/page. Fetches a public web page and returns its readable text. */
export async function handlePage(request: Request, env: Env): Promise<Response> {
  const settings = readSettings(env);
  const early = preflight(request, settings);
  if (early) return early;
  const cors = corsHeaders(request, settings);
  if (request.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST.", cors);

  let target: URL | null = null;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url === "string") {
      target = isPublicHttpUrl(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`);
    }
  } catch {
    /* handled below */
  }
  if (!target) {
    return errorResponse(400, "invalid_url", "Enter a public web address, such as https://example.com.", cors);
  }

  try {
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(9000),
        headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "PolymindBot/0.1 (+page reader)" },
      });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      const next = isPublicHttpUrl(new URL(location, target).toString());
      if (!next) return errorResponse(400, "invalid_url", "That link redirects somewhere Polymind cannot read.", cors);
      target = next;
    }
    if (!response || !response.ok) {
      return errorResponse(422, "page_unavailable", "That page did not load. Check the link and try again.", cors);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)|application\/xhtml/.test(type)) {
      return errorResponse(415, "unsupported_page", "Polymind can only read web pages and plain text.", cors);
    }

    const raw = await readCapped(response);
    const { title, text } = type.includes("text/plain") ? { title: "", text: raw.trim() } : extractReadableText(raw);
    if (text.length < 40) {
      return errorResponse(422, "page_empty", "No readable text was found on that page.", cors);
    }
    const extract: PageExtract = {
      title: title || target.hostname,
      url: target.toString(),
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
    };
    return json(extract, { headers: cors });
  } catch {
    return errorResponse(504, "page_timeout", "That page took too long to respond.", cors);
  }
}
