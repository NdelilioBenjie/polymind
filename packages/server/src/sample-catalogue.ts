import type { ModelInfo } from "./catalogue.ts";

/** A small snapshot used only when the live catalogue cannot be reached
 *  (for example while developing offline). The live list always wins. */
const rows: Array<[id: string, name: string, context: number, prompt: number, completion: number]> = [
  ["thinkingmachines/inkling-2-small:free", "Thinking Machines: Inkling 2 Small (free)", 1_048_576, 0, 0],
  ["nvidia/nemotron-3.5-super-vl:free", "NVIDIA: Nemotron 3.5 Super VL (free)", 1_000_000, 0, 0],
  ["liquid/lfm-3-1.7b:free", "LiquidAI: LFM3-1.7B (free)", 262_144, 0, 0],
  ["recursive/flint-v1.0:free", "Recursive: Flint (free)", 262_144, 0, 0],
  ["openai/gpt-6.1-sol", "OpenAI: GPT-6.1 Sol", 1_050_000, 2, 10],
  ["openai/gpt-6.1-terra", "OpenAI: GPT-6.1 Terra", 1_050_000, 1, 5],
  ["anthropic/claude-fable-5.2", "Anthropic: Claude Fable 5.2", 1_000_000, 8, 40],
  ["anthropic/claude-sonnet-5.5", "Anthropic: Claude Sonnet 5.5", 1_000_000, 2, 10],
  ["google/gemini-4-carbon", "Google: Gemini 4 Carbon", 1_048_576, 2, 10],
  ["google/gemini-omni-1.2-flash", "Google: Gemini Omni 1.2 Flash", 131_072, 1.5, 9],
  ["mistralai/mistral-large-4-0", "Mistral: Mistral Large 4", 1_048_576, 0.7, 2.1],
  ["deepseek/deepseek-v4.1-flash-1017", "DeepSeek: DeepSeek V4.1 Flash 1017", 1_048_576, 0.006, 0.5],
  ["meta/muse-ember", "Meta: Muse Ember", 1_048_576, 0.1, 0.5],
  ["tencent/hy4", "Tencent: Hy4", 1_048_576, 0.417, 1.25],
];

export const SAMPLE_CATALOGUE: Omit<ModelInfo, "available" | "tier">[] = rows.map(
  ([id, fullName, contextLength, promptPrice, completionPrice], index) => {
    const [providerName, ...rest] = fullName.split(": ");
    return {
      id,
      name: rest.join(": ") || fullName,
      provider: id.split("/")[0],
      providerName,
      description: "",
      contextLength,
      promptPrice,
      completionPrice,
      free: promptPrice === 0 && completionPrice === 0,
      vision: false,
      created: 1_790_000_000 - index * 86_400,
    };
  },
);
