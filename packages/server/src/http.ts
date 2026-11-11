/** Small HTTP helpers shared by every endpoint. Web-standard APIs only, so the
 *  same code runs in Netlify Edge Functions (Deno), Node and the Vite dev server. */

export interface Env {
  get(name: string): string | undefined;
}

export type AccessPolicy = "free" | "all";

export interface ServerSettings {
  apiKey: string | undefined;
  /** Base URL of the OpenRouter-compatible API, without a trailing slash. */
  apiBase: string;
  mode: "live" | "demo";
  access: AccessPolicy;
  maxOutputTokens: number;
  allowedOrigins: string[];
}

export const MAX_MODELS_PER_PROMPT = 4;

const OPENROUTER_API = "https://openrouter.ai/api/v1";

function isOpenRouterHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

export function readSettings(env: Env): ServerSettings {
  let apiKey = env.get("OPENROUTER_API_KEY")?.trim() || undefined;
  let apiBase = env.get("OPENROUTER_BASE_URL")?.trim().replace(/\/+$/, "") || OPENROUTER_API;

  // Netlify's AI Gateway injects its own OPENROUTER_API_KEY and OPENROUTER_BASE_URL
  // whenever the site owner has not set a key. That key is billed to the owner's
  // Netlify credits and only works against the gateway URL, so Polymind ignores the
  // pair unless the owner opts in with POLYMIND_USE_NETLIFY_GATEWAY=true.
  const injectedByGateway = !isOpenRouterHost(apiBase);
  if (injectedByGateway && env.get("POLYMIND_USE_NETLIFY_GATEWAY")?.trim().toLowerCase() !== "true") {
    apiKey = undefined;
    apiBase = OPENROUTER_API;
  }
  const cap = Number(env.get("POLYMIND_MAX_OUTPUT_TOKENS"));
  return {
    apiKey,
    apiBase,
    mode: apiKey ? "live" : "demo",
    access: env.get("POLYMIND_MODEL_ACCESS")?.trim().toLowerCase() === "all" ? "all" : "free",
    maxOutputTokens: Number.isFinite(cap) && cap >= 64 ? Math.min(Math.floor(cap), 16_000) : 2048,
    allowedOrigins: (env.get("POLYMIND_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

/** Browsers on other origins may call the API only from the extension, from
 *  localhost during development, or from origins the owner listed explicitly. */
export function isAllowedOrigin(origin: string, settings: ServerSettings): boolean {
  if (origin.startsWith("chrome-extension://")) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return settings.allowedOrigins.includes(origin);
}

export function corsHeaders(request: Request, settings: ServerSettings): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(origin, settings)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "x-polymind-mode",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function preflight(request: Request, settings: ServerSettings): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request, settings) });
}

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message } }, { status, headers });
}
