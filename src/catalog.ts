import type { Model } from "@earendil-works/pi-ai";

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_CONCURRENCY = 24;

type PiModelDefinition = Pick<
  Model<string>,
  "id" | "name" | "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens"
>;

interface CatalogModel {
  id: string;
  name: string;
  type: string;
  context_window: number;
  max_tokens: number;
  tags?: string[];
  supported_parameters?: string[];
}

interface CatalogEndpoint {
  provider_name: string;
  context_length?: number | null;
  max_completion_tokens?: number | null;
  pricing?: {
    prompt?: string;
    prompt_tiers?: CatalogPricingTier[];
    input_tiers?: CatalogPricingTier[];
    completion?: string;
    completion_tiers?: CatalogPricingTier[];
    output_tiers?: CatalogPricingTier[];
    input_cache_read?: string;
    input_cache_read_tiers?: CatalogPricingTier[];
    input_cache_write?: string;
    input_cache_write_tiers?: CatalogPricingTier[];
  };
  supported_parameters?: string[];
}

interface CatalogPricingTier {
  cost: string;
  min: number;
  max?: number;
}

interface EndpointResponse {
  data?: {
    architecture?: { input_modalities?: string[] };
    endpoints?: CatalogEndpoint[];
  };
}

export interface CatalogCache {
  models?: readonly PiModelDefinition[];
  checkedAt?: number;
}

export interface DiscoveryOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export function splitExplicitModelId(id: string): { upstreamModelId: string; provider: string } {
  const separator = id.lastIndexOf("@");
  if (separator <= 0 || separator === id.length - 1) {
    throw new Error(`Model ID must end with an explicit Vercel provider: ${id}@provider`);
  }
  const upstreamModelId = id.slice(0, separator);
  const provider = id.slice(separator + 1);
  if (!/^[A-Za-z0-9-]+$/.test(provider)) throw new Error(`Invalid Vercel provider slug: ${provider}`);
  return { upstreamModelId, provider };
}

function routingSlug(providerName: string): string {
  // Vercel exposes a transport-specific name for Anthropic on Vertex, while
  // providerOptions.gateway.only uses the public `vertex` routing slug.
  return providerName === "vertexAnthropic" ? "vertex" : providerName;
}

function perMillion(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function tierRate(base: string | undefined, tiers: CatalogPricingTier[] | undefined, minimum: number): number {
  const match = tiers
    ?.filter((tier) => tier.min <= minimum && (tier.max === undefined || minimum < tier.max))
    .sort((left, right) => right.min - left.min)[0];
  return perMillion(match?.cost ?? base);
}

function endpointCost(pricing: CatalogEndpoint["pricing"]): PiModelDefinition["cost"] {
  const promptTiers = pricing?.prompt_tiers ?? pricing?.input_tiers;
  const completionTiers = pricing?.completion_tiers ?? pricing?.output_tiers;
  const thresholds = new Set<number>();
  for (const tiers of [promptTiers, completionTiers, pricing?.input_cache_read_tiers, pricing?.input_cache_write_tiers]) {
    for (const tier of tiers ?? []) if (tier.min > 0) thresholds.add(tier.min);
  }

  const ratesAt = (minimum: number) => ({
    input: tierRate(pricing?.prompt, promptTiers, minimum),
    output: tierRate(pricing?.completion, completionTiers, minimum),
    cacheRead: tierRate(pricing?.input_cache_read, pricing?.input_cache_read_tiers, minimum),
    cacheWrite: tierRate(pricing?.input_cache_write, pricing?.input_cache_write_tiers, minimum),
  });
  return {
    ...ratesAt(0),
    ...(thresholds.size > 0 && {
      tiers: [...thresholds]
        .sort((left, right) => left - right)
        .map((minimum) => ({ inputTokensAbove: minimum - 1, ...ratesAt(minimum) })),
    }),
  };
}

function endpointModel(
  catalog: CatalogModel,
  endpoint: CatalogEndpoint,
  inputModalities: string[],
): PiModelDefinition {
  const provider = routingSlug(endpoint.provider_name);
  return {
    id: `${catalog.id}@${provider}`,
    name: `${catalog.name} via ${provider}`,
    reasoning: catalog.tags?.includes("reasoning") ?? false,
    input: inputModalities.includes("image") ? ["text", "image"] : ["text"],
    cost: endpointCost(endpoint.pricing),
    contextWindow: endpoint.context_length || catalog.context_window,
    maxTokens: endpoint.max_completion_tokens || catalog.max_tokens,
  };
}

export async function discoverExplicitModels(options: DiscoveryOptions = {}): Promise<PiModelDefinition[]> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(MODELS_URL, { signal: options.signal });
  if (!response.ok) throw new Error(`Vercel model discovery failed: HTTP ${response.status}`);
  const payload = await response.json() as { data?: CatalogModel[] };
  const catalog = (payload.data ?? []).filter(
    (model) => model.type === "language" && model.supported_parameters?.includes("tools"),
  );

  let cursor = 0;
  const discovered: PiModelDefinition[] = [];
  const workers = Array.from({ length: Math.min(DISCOVERY_CONCURRENCY, catalog.length) }, async () => {
    while (cursor < catalog.length) {
      const model = catalog[cursor++];
      if (options.signal?.aborted) throw new Error("Vercel model discovery aborted");
      const endpointResponse = await fetcher(`${MODELS_URL}/${model.id}/endpoints`, { signal: options.signal });
      if (!endpointResponse.ok) continue;
      const endpointPayload = await endpointResponse.json() as EndpointResponse;
      const modalities = endpointPayload.data?.architecture?.input_modalities ?? ["text"];
      const seen = new Set<string>();
      for (const endpoint of endpointPayload.data?.endpoints ?? []) {
        if (!endpoint.supported_parameters?.includes("tools")) continue;
        const provider = routingSlug(endpoint.provider_name);
        if (seen.has(provider)) continue;
        seen.add(provider);
        discovered.push(endpointModel(model, endpoint, modalities));
      }
    }
  });
  await Promise.all(workers);

  return discovered.sort((left, right) => left.id.localeCompare(right.id));
}

export function usableCachedModels(
  cache: CatalogCache | undefined,
  now = Date.now(),
): readonly PiModelDefinition[] | undefined {
  const models = cachedExplicitModels(cache);
  if (!models || cache?.checkedAt === undefined) return undefined;
  return now - cache.checkedAt < CATALOG_TTL_MS ? models : undefined;
}

export function cachedExplicitModels(cache: CatalogCache | undefined): readonly PiModelDefinition[] | undefined {
  if (!cache?.models?.length) return undefined;
  try {
    for (const model of cache.models) splitExplicitModelId(model.id);
    return cache.models;
  } catch {
    return undefined;
  }
}
