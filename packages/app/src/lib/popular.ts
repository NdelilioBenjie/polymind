import type { ModelInfo } from "../types";

/** The router that picks a model for each prompt. Shown under Polymind's own name. */
export const AUTO_MODEL_ID = "openrouter/auto";

interface Family {
  label: string;
  /** Matched against "maker name id", lower-cased. */
  match: RegExp;
  take: number;
}

/** The model families most people recognise, in the order they are shown. */
const FAMILIES: Family[] = [
  { label: "OpenAI", match: /\bopenai\b.*\bgpt\b|\bopenai\/(gpt|o\d)/, take: 4 },
  { label: "Anthropic", match: /\bclaude\b/, take: 4 },
  { label: "Google", match: /\bgemini\b/, take: 3 },
  { label: "xAI", match: /\bgrok\b/, take: 2 },
  { label: "DeepSeek", match: /\bdeepseek\b/, take: 2 },
  { label: "Moonshot AI", match: /\bkimi\b/, take: 1 },
  { label: "Zhipu", match: /\bglm\b/, take: 2 },
  { label: "Alibaba", match: /\bqwen\b/, take: 1 },
  { label: "Meta", match: /\bmeta\b|\bllama\b/, take: 1 },
  { label: "Mistral", match: /\bmistral\b/, take: 1 },
];

/** Variants that would crowd out the main models. */
const NOISE = /:(batch|free|extended|thinking|nitro|floor)\b|image|audio|embed|guard|search|realtime|tts|transcribe/;

export function displayName(model: Pick<ModelInfo, "id" | "name">): string {
  return model.id === AUTO_MODEL_ID ? "Polymind Auto" : model.name;
}

export function displayMaker(model: Pick<ModelInfo, "id" | "providerName">): string {
  return model.id === AUTO_MODEL_ID ? "Picks the best model for each prompt" : model.providerName;
}

/** The auto router first, then the newest few models from each well-known family. */
export function popularModels(models: ModelInfo[]): ModelInfo[] {
  const picked: ModelInfo[] = [];
  const auto = models.find((model) => model.id === AUTO_MODEL_ID);
  if (auto) picked.push(auto);

  const newestFirst = [...models].sort((a, b) => b.created - a.created);
  for (const family of FAMILIES) {
    const matches = newestFirst.filter((model) => {
      const text = `${model.providerName} ${model.name} ${model.id}`.toLowerCase();
      return family.match.test(text) && !NOISE.test(model.id.toLowerCase()) && !picked.includes(model);
    });
    // Prefer models visitors can actually use, then fill with the rest.
    const usable = matches.filter((model) => model.available);
    const rest = matches.filter((model) => !model.available);
    picked.push(...[...usable, ...rest].slice(0, family.take));
  }
  return picked;
}
