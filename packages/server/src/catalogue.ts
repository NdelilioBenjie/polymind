import {
  corsHeaders,
  errorResponse,
  json,
  MAX_MODELS_PER_PROMPT,
  preflight,
  readSettings,
  type Env,
  type ServerSettings,
} from "./http.ts";
import { SAMPLE_CATALOGUE } from "./sample-catalogue.ts";

export interface ModelInfo {
  id: string;
  name: string;
  /** Slug before the slash in the id, e.g. "openai". */
  provider: string;
  providerName: string;
  description: string;
  contextLength: number;
  /** US dollars per million tokens. */
  promptPrice: number;
  completionPrice: number;
  free: boolean;
  vision: boolean;
  /** Unix seconds. */
  created: number;
  /** Whether this deployment lets visitors use the model. */
  available: boolean;
  /** "premium" models cost the site owner money; "locked" ones are switched off. */
  tier: ModelTier;
}

export type ModelTier = "free" | "premium" | "locked";
type BaseModel = Omit<ModelInfo, "available" | "tier">;

export interface CatalogueResponse {
  mode: "live" | "demo";
  access: "free" | "allowance" | "all";
  /** Present in allowance mode: paid answers each visitor gets per day. */
  allowance?: { perDay: number };
  source: "openrouter" | "sample";
  maxModelsPerPrompt: number;
  models: ModelInfo[];
}

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  created?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown };
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const TTL_MS = 10 * 60 * 1000;

let cache: { at: number; models: BaseModel[] } | null = null;

const perMillion = (value: unknown): number => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Number((price * 1_000_000).toPrecision(6)) : 0;
};

const includes = (list: unknown, item: string): boolean =>
  Array.isArray(list) && list.includes(item);

/** Turns one raw OpenRouter record into the compact shape the UI needs.
 *  Returns null for records that cannot hold a text conversation. */
export function normaliseModel(raw: OpenRouterModel): BaseModel | null {
  if (typeof raw.id !== "string" || !raw.id.includes("/")) return null;
  const outputs = raw.architecture?.output_modalities;
  if (Array.isArray(outputs) && !outputs.includes("text")) return null;

  const fullName = typeof raw.name === "string" && raw.name ? raw.name : raw.id;
  const separator = fullName.indexOf(": ");
  const provider = raw.id.split("/")[0];
  const promptPrice = perMillion(raw.pricing?.prompt);
  const completionPrice = perMillion(raw.pricing?.completion);

  return {
    id: raw.id,
    name: separator > 0 ? fullName.slice(separator + 2) : fullName,
    provider,
    providerName: separator > 0 ? fullName.slice(0, separator) : provider,
    description: typeof raw.description === "string" ? raw.description.slice(0, 280) : "",
    contextLength: Number(raw.context_length) || 0,
    promptPrice,
    completionPrice,
    // Routers such as openrouter/auto report a price of -1, meaning "depends on
    // the model chosen". Only an explicit zero counts as free.
    free: Number(raw.pricing?.prompt) === 0 && Number(raw.pricing?.completion) === 0,
    vision: includes(raw.architecture?.input_modalities, "image"),
    created: Number(raw.created) || 0,
  };
}

export async function loadCatalogue(
  fetcher: typeof fetch = fetch,
): Promise<{ source: "openrouter" | "sample"; models: BaseModel[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return { source: "openrouter", models: cache.models };
  try {
    const response = await fetcher(MODELS_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Catalogue request failed with ${response.status}`);
    const payload = (await response.json()) as { data?: OpenRouterModel[] };
    const models = (payload.data ?? [])
      .map(normaliseModel)
      .filter((model): model is BaseModel => model !== null);
    if (models.length === 0) throw new Error("Catalogue was empty");
    cache = { at: Date.now(), models };
    return { source: "openrouter", models };
  } catch {
    if (cache) return { source: "openrouter", models: cache.models };
    return { source: "sample", models: SAMPLE_CATALOGUE };
  }
}

/** Decides what a visitor may do with a model on this deployment. */
export function tierOf(
  model: Pick<ModelInfo, "free" | "completionPrice"> | undefined,
  modelId: string,
  settings: ServerSettings,
): ModelTier {
  if (settings.mode === "demo") return "free";
  if (model ? model.free : modelId.endsWith(":free")) return "free";
  if (settings.access === "all") return "premium";
  if (settings.access === "allowance" && model && model.completionPrice <= settings.premiumPriceCeiling) {
    return "premium";
  }
  return "locked";
}

/** GET /api/models */
export async function handleModels(request: Request, env: Env): Promise<Response> {
  const settings = readSettings(env);
  const early = preflight(request, settings);
  if (early) return early;
  const cors = corsHeaders(request, settings);
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", "Use GET.", cors);

  const { source, models } = await loadCatalogue();
  const body: CatalogueResponse = {
    mode: settings.mode,
    access: settings.access,
    source,
    maxModelsPerPrompt: MAX_MODELS_PER_PROMPT,
    allowance: settings.mode === "live" && settings.access === "allowance" ? { perDay: settings.dailyPremium } : undefined,
    models: models.map((model) => {
      const tier = tierOf(model, model.id, settings);
      return { ...model, tier, available: tier !== "locked" };
    }),
  };
  return json(body, {
    headers: { ...cors, "cache-control": "public, max-age=300, s-maxage=900" },
  });
}

/** Test hook. */
export function resetCatalogueCache(): void {
  cache = null;
}
