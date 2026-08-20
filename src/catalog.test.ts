import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_TTL_MS, cachedExplicitModels, splitExplicitModelId, usableCachedModels } from "./catalog.js";

test("splits an explicit provider suffix", () => {
  assert.deepEqual(splitExplicitModelId("deepseek/deepseek-v4-flash-0731@runware"), {
    upstreamModelId: "deepseek/deepseek-v4-flash-0731",
    provider: "runware",
  });
});

test("rejects model IDs without an explicit provider", () => {
  assert.throws(() => splitExplicitModelId("deepseek/deepseek-v4-flash-0731"));
});

test("uses only fresh cached catalogs", () => {
  const models = [{ id: "a/b@provider" }] as never[];
  assert.equal(usableCachedModels({ models, checkedAt: 100 }, 100 + CATALOG_TTL_MS - 1), models);
  assert.equal(usableCachedModels({ models, checkedAt: 100 }, 100 + CATALOG_TTL_MS), undefined);
});

test("rejects Pi's old bare-model cache when overriding the built-in provider", () => {
  const bare = [{ id: "deepseek/deepseek-v4-flash-0731" }] as never[];
  assert.equal(cachedExplicitModels({ models: bare, checkedAt: Date.now() }), undefined);
});
