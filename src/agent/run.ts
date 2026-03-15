import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";
import { tools } from "./tools/index.ts";
import { executeTool } from "./executeTools.ts";
import { getTracer, Laminar } from "@lmnr-ai/lmnr";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import {
  estimateMessagesTokens,
  getModelLimits,
  isOverThreshold,
  calculateUsagePercentage,
  compactConversation,
  DEFAULT_THRESHOLD,
} from "./context/index.ts";

const MODEL_NAME = "gpt-5-mini";
Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY || "",
});

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<any> {
  const modelLimits = getModelLimits(MODEL_NAME);

  let workingHistory = filterCompatibleMessages(conversationHistory);
  const preCheckTokens = estimateMessagesTokens([
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage },
  ]);
  if (isOverThreshold(preCheckTokens.total, modelLimits.contextWindow)) {
    workingHistory = await compactConversation(workingHistory, MODEL_NAME);
  }
  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage },
  ];

  let fullResponse = "";

  while (true) {
    const result = streamText({
      model: openai(MODEL_NAME),
      messages,
      tools,
      toolChoice: "auto",
      experimental_telemetry: {
        tracer: getTracer(),
        isEnabled: true,
      },
    });
    const reportTokenUsage = () => {
      if (callbacks.onTokenUsage) {
        const usage = estimateMessagesTokens(messages);
        callbacks.onTokenUsage({
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.total,
          contextWindow: modelLimits.contextWindow,
          threshold: DEFAULT_THRESHOLD,
          percentage: calculateUsagePercentage(
            usage.total,
            modelLimits.contextWindow,
          ),
        });
      }
    };
    reportTokenUsage();

    const toolCalls: ToolCallInfo[] = [];
    let currentText = "";
    let streamErr: Error | null = null;
    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") {
          currentText += chunk.text;
          callbacks.onToken?.(chunk.text);
        } else if (chunk.type === "tool-call") {
          const input = chunk.input || ({} as any);
          toolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: input,
          });
          callbacks.onToolCallStart?.(chunk.toolName, chunk.input);
        }
      }
    } catch (err) {
      streamErr = err as Error;
      // Handle streaming error
      if (!currentText && !streamErr.message.includes("No output generated")) {
        throw err;
      }
    }
    // Otherwise, proceed with what we have
    fullResponse += currentText;
    // if there was an error and no text, we break with an error message
    if (streamErr && !currentText) {
      fullResponse =
        "Sorry, there was an error processing your request. Please try again.";
      callbacks.onToken?.(fullResponse);
      break;
    }

    const finishReason = await result.finishReason;
    // if finished without tool calls, return final response
    if (finishReason !== "tool-calls" || toolCalls.length === 0) {
      const response = await result.response;
      messages.push(...response.messages);
      reportTokenUsage();
      break;
    }

    const responseMessages = await result.response;
    messages.push(...responseMessages.messages);
    reportTokenUsage();
    // there were tool calls, so we loop again
    let rejected = false;
    for (const tc of toolCalls) {
      // Skip tools that the SDK handles internally (like web_search from openai.tools).
      // These tools don't have a custom execute function and are handled during streaming.
      if (tc.toolName === "web_search") {
        continue;
      }

      // 実際は、ツールによって許可が必要かを決定する
      const approved = await callbacks.onToolApproval(tc.toolName, tc.args);
      if (!approved) {
        rejected = true;
        break;
      }

      const result = await executeTool(tc.toolName, tc.args);
      callbacks.onToolCallEnd?.(tc.toolName, result);
      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: { type: "text", value: result },
          },
        ],
      });
      reportTokenUsage();
    }
    if (rejected) {
      break;
    }
  }
  callbacks.onComplete?.(fullResponse);
  return messages;
}
