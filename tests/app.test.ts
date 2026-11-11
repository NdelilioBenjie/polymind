import { describe, expect, it } from "vitest";
import { formatContext, formatPrice, titleFrom } from "../packages/app/src/lib/format";
import { buildQuickAction, fillPrompt, promptVariables, systemPrompt } from "../packages/app/src/lib/prompts";
import { createSseParser } from "../packages/app/src/lib/sse";

describe("SSE parser", () => {
  const collect = (chunks: string[]) => {
    const out: string[] = [];
    const parser = createSseParser((data) => out.push(data));
    chunks.forEach((chunk) => parser.feed(chunk));
    parser.end();
    return out;
  };

  it("reassembles events split across chunks", () => {
    expect(collect(['data: {"a"', ":1}\n", "\ndata: [DO", "NE]\n\n"])).toEqual(['{"a":1}', "[DONE]"]);
  });
  it("ignores comments and handles CRLF", () => {
    expect(collect([": OPENROUTER PROCESSING\r\n\r\ndata: one\r\n\r\n"])).toEqual(["one"]);
  });
  it("flushes a final event with no trailing blank line", () => {
    expect(collect(["data: tail"])).toEqual(["tail"]);
  });
});

describe("prompts", () => {
  it("finds each blank once", () => {
    expect(promptVariables("{{a}} and {{ b }} and {{a}}")).toEqual(["a", "b"]);
  });
  it("fills blanks and leaves empty ones visible", () => {
    expect(fillPrompt("Explain {{topic}} in {{tone}}", { topic: "DNS" })).toBe("Explain DNS in {{tone}}");
  });
  it("separates what the user sees from what the model receives", () => {
    const { prompt, instruction } = buildQuickAction({
      kind: "summarise",
      text: "Some passage",
      source: { title: "Page", url: "https://example.com" },
    });
    expect(prompt).toBe("Summarise: “Some passage”");
    expect(instruction).toContain("Some passage");
    expect(instruction).toContain("https://example.com");
  });
  it("adds the page to the system prompt only when one is attached", () => {
    expect(systemPrompt(undefined)).not.toContain("URL:");
    expect(systemPrompt({ title: "T", url: "https://e.com", text: "Body" })).toContain("Body");
  });
});

describe("formatting", () => {
  it("formats context windows and prices", () => {
    expect(formatContext(1_048_576)).toBe("1M context");
    expect(formatContext(131_072)).toBe("131K context");
    expect(formatPrice({ free: true, promptPrice: 0, completionPrice: 0 })).toBe("Free");
    expect(formatPrice({ free: false, promptPrice: 2, completionPrice: 10 })).toBe("$2 in, $10 out per 1M tokens");
  });
  it("shortens long titles", () => {
    expect(titleFrom("a".repeat(80)).length).toBeLessThanOrEqual(51);
    expect(titleFrom("   ")).toBe("New chat");
  });
});
