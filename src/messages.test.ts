import assert from "node:assert/strict";
import test from "node:test";
import type { Context } from "@earendil-works/pi-ai";
import { toModelMessages } from "./messages.js";

test("converts tool calls and adjacent tool results", () => {
  const context: Context = {
    messages: [
      { role: "user", content: "inspect", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a.ts" } }],
        api: "test",
        provider: "test",
        model: "test",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "source" }],
        isError: false,
        timestamp: 3,
      },
    ],
  };

  const converted = toModelMessages(context);
  assert.equal(converted.length, 3);
  assert.equal(converted[0].role, "user");
  assert.equal(converted[1].role, "assistant");
  assert.equal(converted[2].role, "tool");
});
