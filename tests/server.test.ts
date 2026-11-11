import { beforeEach, describe, expect, it } from "vitest";
import { validateChatRequest, handleChat } from "../packages/server/src/chat.ts";
import { handleModels, isModelAllowed, normaliseModel, resetCatalogueCache } from "../packages/server/src/catalogue.ts";
import { corsHeaders, readSettings } from "../packages/server/src/http.ts";
import { extractReadableText, isPublicHttpUrl } from "../packages/server/src/page.ts";

const env = (values: Record<string, string> = {}) => ({ get: (name: string) => values[name] });

describe("settings", () => {
  it("runs in demo mode with free-only access until a key is set", () => {
    expect(readSettings(env())).toMatchObject({ mode: "demo", access: "free", maxOutputTokens: 2048 });
    expect(readSettings(env({ OPENROUTER_API_KEY: "sk", POLYMIND_MODEL_ACCESS: "ALL" }))).toMatchObject({
      mode: "live",
      access: "all",
    });
  });

  it("ignores the key Netlify's AI Gateway injects unless the owner opts in", () => {
    const injected = { OPENROUTER_API_KEY: "gateway-token", OPENROUTER_BASE_URL: "https://site.netlify.app/.netlify/ai/" };
    expect(readSettings(env(injected))).toMatchObject({ mode: "demo", apiBase: "https://openrouter.ai/api/v1" });
    expect(readSettings(env({ ...injected, POLYMIND_USE_NETLIFY_GATEWAY: "true" }))).toMatchObject({
      mode: "live",
      apiBase: "https://site.netlify.app/.netlify/ai",
    });
    expect(readSettings(env({ OPENROUTER_API_KEY: "sk-or-own" }))).toMatchObject({
      mode: "live",
      apiBase: "https://openrouter.ai/api/v1",
    });
  });

  it("only reflects origins it trusts", () => {
    const settings = readSettings(env({ POLYMIND_ALLOWED_ORIGINS: "https://a.example" }));
    const from = (origin: string) => corsHeaders(new Request("https://x.test", { headers: { origin } }), settings);
    expect(from("chrome-extension://abc")["access-control-allow-origin"]).toBe("chrome-extension://abc");
    expect(from("https://a.example")["access-control-allow-origin"]).toBe("https://a.example");
    expect(from("https://evil.example")).toEqual({});
  });
});

describe("catalogue", () => {
  it("normalises an OpenRouter record", () => {
    const model = normaliseModel({
      id: "openai/gpt-x",
      name: "OpenAI: GPT X",
      context_length: 128000,
      created: 5,
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      pricing: { prompt: "0.000002", completion: "0.00001" },
    });
    expect(model).toMatchObject({
      name: "GPT X", provider: "openai", providerName: "OpenAI", promptPrice: 2, completionPrice: 10,
      free: false, vision: true,
    });
  });

  it("does not treat variable-price routers as free", () => {
    const auto = normaliseModel({ id: "openrouter/auto", name: "Auto Router", pricing: { prompt: "-1", completion: "-1" } });
    expect(auto?.free).toBe(false);
    expect(normaliseModel({ id: "a/b:free", pricing: { prompt: "0", completion: "0" } })?.free).toBe(true);
    expect(normaliseModel({ id: "a/unknown" })?.free).toBe(false);
  });

  it("drops models that cannot answer in text", () => {
    expect(normaliseModel({ id: "a/image", architecture: { output_modalities: ["image"] } })).toBeNull();
    expect(normaliseModel({ id: "no-slash" })).toBeNull();
  });

  it("locks paid models when access is free", () => {
    const free = readSettings(env({ OPENROUTER_API_KEY: "sk" }));
    const all = readSettings(env({ OPENROUTER_API_KEY: "sk", POLYMIND_MODEL_ACCESS: "all" }));
    expect(isModelAllowed({ free: false }, "a/b", free)).toBe(false);
    expect(isModelAllowed({ free: true }, "a/b", free)).toBe(true);
    expect(isModelAllowed(undefined, "a/b:free", free)).toBe(true);
    expect(isModelAllowed({ free: false }, "a/b", all)).toBe(true);
  });
});

describe("chat validation", () => {
  const user = { role: "user", content: "hi" };
  it("accepts a well-formed request", () => {
    expect(validateChatRequest({ model: "openai/gpt-x", messages: [user] }).ok).toBe(true);
  });
  it.each([
    [{ model: "nope", messages: [user] }],
    [{ model: "a/b", messages: [] }],
    [{ model: "a/b", messages: [{ role: "tool", content: "x" }] }],
    [{ model: "a/b", messages: [user, { role: "assistant", content: "x" }] }],
    [{ model: "a/b", messages: [{ role: "user", content: "x".repeat(200_000) }] }],
  ])("rejects malformed request %#", (body) => {
    expect(validateChatRequest(body).ok).toBe(false);
  });
});

describe("endpoints in demo mode", () => {
  beforeEach(() => resetCatalogueCache());

  it("streams a simulated answer in the OpenAI chunk format", async () => {
    const response = await handleChat(
      new Request("https://x.test/api/chat", {
        method: "POST",
        body: JSON.stringify({ model: "demo/model", messages: [{ role: "user", content: "Hello there" }] }),
      }),
      env(),
    );
    expect(response.headers.get("x-polymind-mode")).toBe("demo");
    const text = await response.text();
    expect(text).toContain('"delta"');
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  }, 15_000);

  it("rejects the wrong method", async () => {
    expect((await handleChat(new Request("https://x.test/api/chat"), env())).status).toBe(405);
    expect((await handleModels(new Request("https://x.test/api/models", { method: "POST" }), env())).status).toBe(405);
  });
});

describe("page reader", () => {
  it.each([
    "http://localhost/x", "http://127.0.0.1/", "http://10.0.0.8/", "http://192.168.1.1/", "http://169.254.169.254/",
    "http://[::1]/", "ftp://example.com", "https://user:pw@example.com", "https://example.com:8443/", "https://intranet/",
    "https://printer.local/",
  ])("refuses %s", (url) => {
    expect(isPublicHttpUrl(url)).toBeNull();
  });

  it("allows ordinary public pages", () => {
    expect(isPublicHttpUrl("https://example.com/a?b=1")?.hostname).toBe("example.com");
  });

  it("keeps readable text and drops scripts, styles and navigation", () => {
    const { title, text } = extractReadableText(
      "<html><head><title>Hello &amp; welcome</title><style>p{}</style></head><body><nav>Menu</nav>" +
        "<h1>Heading</h1><p>First&nbsp;paragraph.</p><script>alert(1)</script><p>Second &#8212; one.</p></body></html>",
    );
    expect(title).toBe("Hello & welcome");
    expect(text).toBe("Heading\nFirst paragraph.\nSecond — one.");
  });
});
