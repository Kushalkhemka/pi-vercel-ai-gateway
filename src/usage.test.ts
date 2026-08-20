import assert from "node:assert/strict";
import test from "node:test";
import type { Usage } from "@earendil-works/pi-ai";
import { applyActualGatewayCost, applyTokenUsage } from "./usage.js";

function usage(): Usage {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
  };
}

test("separates uncached, cache-read, and cache-write input tokens", () => {
  const target = usage();
  applyTokenUsage(target, {
    inputTokens: 1_000,
    outputTokens: 20,
    inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 800, cacheWriteTokens: 100 },
    outputTokenDetails: { reasoningTokens: 5 },
    totalTokens: 1_020,
  });
  assert.deepEqual(
    { input: target.input, read: target.cacheRead, write: target.cacheWrite, reasoning: target.reasoning },
    { input: 100, read: 800, write: 100, reasoning: 5 },
  );
});

test("uses the exact gateway charge while preserving the cost breakdown", () => {
  const target = usage();
  applyActualGatewayCost(target, { gateway: { cost: "1.00" } });
  assert.equal(target.cost.total, 1);
  assert.equal(target.cost.input, 0.5);
  assert.equal(target.cost.output, 0.5);
});
