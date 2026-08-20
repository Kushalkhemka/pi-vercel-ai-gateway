import type { Context, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ModelMessage } from "ai";

function textFromResult(message: ToolResultMessage): string {
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return text || "(no tool output)";
}

export function toModelMessages(context: Context): ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (let index = 0; index < context.messages.length; index++) {
    const message = context.messages[index];

    if (message.role === "user") {
      if (typeof message.content === "string") {
        if (message.content) messages.push({ role: "user", content: message.content });
      } else {
        const content = message.content.map((block) => block.type === "text"
          ? { type: "text" as const, text: block.text }
          : {
              type: "image" as const,
              image: `data:${block.mimeType};base64,${block.data}`,
            });
        if (content.length > 0) messages.push({ role: "user", content });
      }
      continue;
    }

    if (message.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      for (const block of message.content) {
        if (block.type === "text" && block.text) {
          content.push({ type: "text", text: block.text });
        } else if (block.type === "thinking" && block.thinking) {
          content.push({ type: "reasoning", text: block.thinking });
        } else if (block.type === "toolCall") {
          content.push({
            type: "tool-call",
            toolCallId: block.id,
            toolName: block.name,
            input: block.arguments,
          });
        }
      }
      if (content.length > 0) {
        messages.push({ role: "assistant", content } as ModelMessage);
      }
      continue;
    }

    const results: Array<Record<string, unknown>> = [];
    let cursor = index;
    while (cursor < context.messages.length && context.messages[cursor].role === "toolResult") {
      const result = context.messages[cursor] as ToolResultMessage;
      const media = result.content.filter((block) => block.type === "image");
      const text = textFromResult(result);
      results.push({
        type: "tool-result",
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        output: result.isError
          ? { type: "error-text", value: text }
          : media.length > 0
            ? {
                type: "content",
                value: [
                  { type: "text", text },
                  ...media.map((block) => ({
                    type: "file-data",
                    data: block.data,
                    mediaType: block.mimeType,
                  })),
                ],
              }
            : { type: "text", value: text },
      });
      cursor++;
    }
    messages.push({ role: "tool", content: results } as ModelMessage);
    index = cursor - 1;
  }

  return messages;
}
