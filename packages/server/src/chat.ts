import { isModelAllowed, loadCatalogue } from "./catalogue.ts";
import { demoStream } from "./demo.ts";
import { corsHeaders, errorResponse, preflight, readSettings, type Env } from "./http.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARS = 160_000;
const ROLES = new Set(["system", "user", "assistant"]);

export type Validation = { ok: true; value: ChatRequest } | { ok: false; message: string };

export function validateChatRequest(body: unknown): Validation {
  if (!body || typeof body !== "object") return { ok: false, message: "Send a JSON object." };
  const { model, messages, temperature, maxTokens } = body as Record<string, unknown>;

  if (typeof model !== "string" || !/^[\w.:-]+\/[\w.:-]+$/.test(model) || model.length > 120) {
    return { ok: false, message: "Choose a model before sending." };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, message: "The conversation is empty." };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, message: "This conversation is too long. Start a new chat." };
  }

  let total = 0;
  const clean: ChatMessage[] = [];
  for (const message of messages) {
    const { role, content } = (message ?? {}) as Record<string, unknown>;
    if (typeof role !== "string" || !ROLES.has(role) || typeof content !== "string") {
      return { ok: false, message: "A message in the conversation is malformed." };
    }
    total += content.length;
    clean.push({ role: role as ChatMessage["role"], content });
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, message: "That is too much text for one request. Shorten it and retry." };
  }
  if (clean[clean.length - 1].role !== "user") {
    return { ok: false, message: "The last message must come from the user." };
  }

  return {
    ok: true,
    value: {
      model,
      messages: clean,
      temperature:
        typeof temperature === "number" && temperature >= 0 && temperature <= 2 ? temperature : undefined,
      maxTokens: typeof maxTokens === "number" && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
    },
  };
}

function upstreamMessage(status: number, detail: string | undefined): string {
  if (status === 401 || status === 403) return "The server's OpenRouter key was rejected. Check the key.";
  if (status === 402) return "The server's OpenRouter credits have run out.";
  if (status === 404) return "This model is not reachable right now. Pick another one.";
  if (status === 429) return "This model is busy or rate limited. Wait a moment and retry.";
  return detail || "The model provider returned an error. Retry in a moment.";
}

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

/** POST /api/chat. Streams Server-Sent Events in the OpenAI chunk format. */
export async function handleChat(request: Request, env: Env): Promise<Response> {
  const settings = readSettings(env);
  const early = preflight(request, settings);
  if (early) return early;
  const cors = corsHeaders(request, settings);
  if (request.method !== "POST") return errorResponse(405, "method_not_allowed", "Use POST.", cors);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "The request body is not valid JSON.", cors);
  }
  const validation = validateChatRequest(parsed);
  if (!validation.ok) return errorResponse(400, "invalid_request", validation.message, cors);
  const chat = validation.value;

  if (settings.mode === "demo") {
    const prompt = chat.messages[chat.messages.length - 1].content;
    return new Response(demoStream(chat.model, prompt), {
      headers: { ...SSE_HEADERS, ...cors, "x-polymind-mode": "demo" },
    });
  }

  if (settings.access === "free") {
    const { models } = await loadCatalogue();
    const model = models.find((candidate) => candidate.id === chat.model);
    if (!isModelAllowed(model, chat.model, settings)) {
      return errorResponse(
        403,
        "model_locked",
        "This model is not enabled on this server. Pick one marked Free.",
        cors,
      );
    }
  }

  const site = env.get("URL") ?? new URL(request.url).origin;
  let upstream: Response;
  try {
    upstream = await fetch(`${settings.apiBase}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        "content-type": "application/json",
        "http-referer": site,
        "x-openrouter-title": "Polymind",
      },
      body: JSON.stringify({
        model: chat.model,
        messages: chat.messages,
        stream: true,
        temperature: chat.temperature,
        max_tokens: Math.min(chat.maxTokens ?? settings.maxOutputTokens, settings.maxOutputTokens),
      }),
    });
  } catch {
    return errorResponse(502, "upstream_unreachable", "Could not reach the model provider.", cors);
  }

  if (!upstream.ok || !upstream.body) {
    let detail: string | undefined;
    try {
      const payload = (await upstream.json()) as { error?: { message?: string } };
      detail = payload.error?.message;
    } catch {
      /* body was not JSON */
    }
    const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
    return errorResponse(status, "upstream_error", upstreamMessage(upstream.status, detail), cors);
  }

  return new Response(upstream.body, {
    headers: { ...SSE_HEADERS, ...cors, "x-polymind-mode": "live" },
  });
}
