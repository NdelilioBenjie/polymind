import { createSseParser } from "./lib/sse";
import type { Catalogue, PageContext } from "./types";

export class ApiError extends Error {
  /** Premium answers left today, when the server said. */
  allowanceRemaining?: number;

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "request_failed";
  let message =
    response.status === 429
      ? "You are sending requests too quickly. Wait a minute and retry."
      : `The server answered with an error (${response.status}).`;
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    if (payload.error?.message) message = payload.error.message;
    if (payload.error?.code) code = payload.error.code;
  } catch {
    /* not JSON */
  }
  const error = new ApiError(message, response.status, code);
  error.allowanceRemaining = readAllowance(response);
  return error;
}

function readAllowance(response: Response): number | undefined {
  const header = response.headers.get("x-polymind-allowance-remaining");
  return header === null || header === "" ? undefined : Number(header);
}

const UNREACHABLE = "Polymind's server could not be reached. Check your connection and retry.";

async function request(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(UNREACHABLE, 0, "network");
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function fetchCatalogue(apiBase: string): Promise<Catalogue> {
  const response = await request(`${apiBase}/api/models`);
  return (await response.json()) as Catalogue;
}

export async function fetchPage(apiBase: string, url: string): Promise<PageContext> {
  const response = await request(`${apiBase}/api/page`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return (await response.json()) as PageContext;
}

export interface StreamOptions {
  apiBase: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onStart?: (info: { simulated: boolean }) => void;
  /** Called whenever the server reports how many premium answers are left today. */
  onAllowance?: (remaining: number) => void;
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  error?: { message?: string };
}

/** Streams one model's answer. Resolves when the stream ends, rejects with an
 *  ApiError on failure and with an AbortError when the caller stops it. */
export async function streamChat(options: StreamOptions): Promise<void> {
  const response = await request(`${options.apiBase}/api/chat`, {
    method: "POST",
    signal: options.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: options.model, messages: options.messages }),
  });
  if (!response.body) throw new ApiError("The server sent an empty reply.", 502, "empty_stream");
  options.onStart?.({ simulated: response.headers.get("x-polymind-mode") === "demo" });
  const left = readAllowance(response);
  if (left !== undefined) options.onAllowance?.(left);

  let failure: ApiError | null = null;
  const parser = createSseParser((data) => {
    if (data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as StreamChunk;
      if (chunk.error) {
        failure = new ApiError(chunk.error.message ?? "The model stopped unexpectedly.", 502, "stream_error");
        return;
      }
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) options.onDelta(text);
    } catch {
      /* ignore malformed keep-alive payloads */
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
    if (failure) {
      await reader.cancel().catch(() => undefined);
      throw failure;
    }
  }
  parser.end();
  if (failure) throw failure;
}
