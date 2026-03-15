import type { ModelMessage } from "ai";

const hasTextPart = (part: unknown): boolean => {
  if (typeof part === "string") {
    return part.trim().length > 0;
  }
  if (typeof part === "object" && part !== null && "text" in part) {
    const textPart = part as { text?: string };
    return typeof textPart.text === "string" && textPart.text.trim().length > 0;
  }
  return false;
};

const hasToolCallPart = (part: unknown): boolean => {
  if (typeof part !== "object" || part === null) {
    return false;
  }

  const candidate = part as {
    type?: unknown;
    toolCallId?: unknown;
    toolUseId?: unknown;
    toolName?: unknown;
  };

  if (candidate.type === "tool-call" || candidate.type === "tool-use") {
    return true;
  }

  // Be permissive with provider-specific formats to avoid dropping valid tool calls.
  const hasToolId =
    typeof candidate.toolCallId === "string" ||
    typeof candidate.toolUseId === "string";
  const hasToolName = typeof candidate.toolName === "string";
  return hasToolId || hasToolName;
};
/**
 * Filter conversation history to only include compatible message formats.
 * Provider tools (like webSearch) may return messages with formats that
 * cause issues when passed back to subsequent API calls.
 */
export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  return messages.filter((msg) => {
    // Keep user and system messages
    if (msg.role === "user" || msg.role === "system") {
      return true;
    }

    // Keep assistant messages that have text content or tool-call content.
    // Dropping tool-call-only assistant messages can orphan later tool results.
    if (msg.role === "assistant") {
      const content = msg.content;
      if (typeof content === "string" && content.trim()) {
        return true;
      }

      // Check for array content with text or tool-call parts.
      if (Array.isArray(content)) {
        return content.some((part: unknown) => {
          return hasTextPart(part) || hasToolCallPart(part);
        });
      }
    }

    // Keep tool messages
    if (msg.role === "tool") {
      return true;
    }

    return false;
  });
};
