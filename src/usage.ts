import type { Usage } from "@earendil-works/pi-ai";

interface GatewayUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: { reasoningTokens?: number };
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

type ProviderMetadata = Record<string, Record<string, unknown> | undefined> | undefined;

export function applyTokenUsage(target: Usage, source: GatewayUsage): void {
  const cacheRead = source.inputTokenDetails?.cacheReadTokens ?? source.cachedInputTokens ?? 0;
  const cacheWrite = source.inputTokenDetails?.cacheWriteTokens ?? 0;
  const reportedInput = source.inputTokens ?? 0;
  target.cacheRead = cacheRead;
  target.cacheWrite = cacheWrite;
  target.input = source.inputTokenDetails?.noCacheTokens ?? Math.max(0, reportedInput - cacheRead - cacheWrite);
  target.output = source.outputTokens ?? 0;
  target.reasoning = source.outputTokenDetails?.reasoningTokens ?? source.reasoningTokens;
  target.totalTokens = source.totalTokens ?? target.input + target.cacheRead + target.cacheWrite + target.output;
}

export function applyActualGatewayCost(target: Usage, metadata: ProviderMetadata): void {
  const raw = metadata?.gateway?.cost;
  const actual = typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(actual) || actual < 0) return;

  const calculated = target.cost.input + target.cost.output + target.cost.cacheRead + target.cost.cacheWrite;
  if (calculated > 0) {
    const scale = actual / calculated;
    target.cost.input *= scale;
    target.cost.output *= scale;
    target.cost.cacheRead *= scale;
    target.cost.cacheWrite *= scale;
  } else {
    target.cost.input = actual;
  }
  target.cost.total = actual;
}
