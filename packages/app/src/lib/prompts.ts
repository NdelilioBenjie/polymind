import type { PageContext, QuickAction, SavedPrompt } from "../types";

export const BUILTIN_PROMPTS: SavedPrompt[] = [
  {
    id: "builtin-explain",
    title: "Explain it simply",
    body: "Explain {{topic}} to someone new to the subject. Use one everyday analogy and finish with the single most important thing to remember.",
    builtin: true,
  },
  {
    id: "builtin-review",
    title: "Review my code",
    body: "Review this {{language}} code. List bugs first, then risks, then style. Show a corrected version of anything you flag.\n\n{{code}}",
    builtin: true,
  },
  {
    id: "builtin-decide",
    title: "Weigh a decision",
    body: "I need to decide: {{decision}}. Lay out the strongest case for each option, what would change your mind, and what you would do in my position.",
    builtin: true,
  },
  {
    id: "builtin-email",
    title: "Draft a reply",
    body: "Write a reply to the message below. Tone: {{tone}}. Keep it under 120 words.\n\n{{message}}",
    builtin: true,
  },
  {
    id: "builtin-factcheck",
    title: "Check a claim",
    body: "Assess this claim: “{{claim}}”. Say how confident you are, what evidence supports or contradicts it, and what you cannot verify.",
    builtin: true,
  },
  {
    id: "builtin-study",
    title: "Quiz me",
    body: "Ask me five questions about {{subject}}, one at a time, getting harder. Wait for my answer before the next question and correct me briefly.",
    builtin: true,
  },
];

export const STARTERS: string[] = [
  "Explain how a transformer model works, as if I were a first-year student",
  "Write a Python function that removes duplicates but keeps the original order",
  "What are the strongest arguments for and against remote work?",
  "Plan a three-day trip to Zanzibar on a modest budget",
];

const VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function promptVariables(body: string): string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(VARIABLE)) names.add(match[1]);
  return [...names];
}

export function fillPrompt(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE, (whole, name: string) => values[name]?.trim() || whole);
}

const QUICK_LABELS: Record<QuickAction["kind"], string> = {
  explain: "Explain",
  summarise: "Summarise",
  rewrite: "Rewrite",
  translate: "Translate",
  ask: "Ask about",
};

function readerLanguage(): string {
  try {
    const code = navigator.language.split("-")[0];
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? "English";
  } catch {
    return "English";
  }
}

/** Turns a selection action into the visible question and the full instruction. */
export function buildQuickAction(action: QuickAction): { prompt: string; instruction: string } {
  const text = action.text.trim();
  const preview = text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;
  const prompt = `${QUICK_LABELS[action.kind]}: “${preview}”`;
  const from = action.source ? `\n\nSource: ${action.source.title} (${action.source.url})` : "";
  const quoted = `\n\n"""\n${text}\n"""${from}`;

  const instructions: Record<QuickAction["kind"], string> = {
    explain: `Explain the following passage clearly. Define any jargon and say why it matters.${quoted}`,
    summarise: `Summarise the following passage in a few sentences, keeping the key facts and figures.${quoted}`,
    rewrite: `Rewrite the following passage so it is clearer and more concise. Keep the meaning and the tone. Reply with the rewritten text only.${quoted}`,
    translate: `Translate the following passage into ${readerLanguage()}. If it is already in that language, translate it into English. Reply with the translation only.${quoted}`,
    ask: `Here is a passage I selected. Tell me what it says and anything important I should know about it.${quoted}`,
  };
  return { prompt, instruction: instructions[action.kind] };
}

export function systemPrompt(page: PageContext | undefined): string {
  const base = "Answer directly and format with Markdown where it helps. Use fenced code blocks for code.";
  if (!page) return base;
  return [
    base,
    "The user is reading the web page below and may ask about it. Ground answers in the page when the question concerns it, and say so when the page does not contain the answer.",
    `Title: ${page.title}`,
    `URL: ${page.url}`,
    `Page text${page.truncated ? " (truncated)" : ""}:`,
    `"""\n${page.text}\n"""`,
  ].join("\n");
}
