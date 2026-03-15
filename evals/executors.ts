import {
  generateText,
  stepCountIs,
  tool,
  type ToolSet,
  type ModelMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from "./types.ts";
import { buildMessages, buildMockedTools } from "./utils.ts";
import { SYSTEM_PROMPT } from "../src/agent/system/prompt.ts";

const TOOL_DEFINITIONS: Record<
  string,
  { description: string; parameters: z.ZodTypeAny }
> = {
  readFile: {
    description:
      "Read the content of an EXISTING file. ONLY use this when the user explicitly asks to read/see the content. DO NOT use this to check existence before writing or deleting. DO NOT use this with empty arguments",
    parameters: z.object({
      path: z
        .string()
        .describe(
          "Absolute or workspace-relative path to a single file to read. Example: src/app.ts (DO NOT pass a directory — use listFiles for directories).",
        ),
    }),
  },
  writeFile: {
    description:
      "Create or overwrite a UTF-8 text file at the specified path with the provided content. Use this to add or update individual source, doc, or config files. If you need to make multiple edits, call writeFile once per target file. Example: path 'src/newFeature.ts', content 'export const x = 1;'. Avoid binary data and long multi-file transactions without explicit confirmation.",
    parameters: z.object({
      path: z
        .string()
        .describe(
          "Absolute or workspace-relative file path to write. Example: src/component.tsx",
        ),
      content: z
        .string()
        .describe("UTF-8 string content to write to the file."),
    }),
  },
  listFiles: {
    description:
      "List the names of files and directories contained in a directory path (non-recursive). Use this when the user asks to 'show all files in <dir>' or to discover what exists before reading or editing. Returns a JSON-like list/array of file and directory names/paths relative to the requested directory. Example input: 'src/' or 'notes/'. If you need the contents of a specific file after listing, call readFile with that file's path. Use this tool when user ask to explore or inspect directory contents.",
    parameters: z.object({
      directory: z
        .string()
        .describe(
          "Absolute or workspace-relative directory path to list. Example: src/ or notes/ (this tool lists entries — it does not return file contents).",
        ),
    }),
  },
  deleteFile: {
    description:
      "Permanently delete a single file at the specified path. This is irreversible — confirm the target using listFiles/readFile first and only delete files (not directories). Use for removing temporary outputs or files you explicitly intend to remove. Example: 'tmp/output.log' or 'dist/bundle.js'.",
    parameters: z.object({
      path: z
        .string()
        .describe(
          "Absolute or workspace-relative path to a single file to delete. Example: tmp/output.log (do NOT pass a directory).",
        ),
    }),
  },
  runCommand: {
    description:
      "Execute one shell command in the workspace shell and return stdout and stderr. Use for build steps, git commands, linters, or short diagnostics (e.g., 'git status', 'npm run build'). Avoid running long interactive or destructive commands; prefer file-based tools for file manipulation. If the user's intent is to inspect repository status or list files, prefer 'listFiles' or 'runCommand' with a safe read-only command like 'git status --porcelain'.",
    parameters: z.object({
      command: z
        .string()
        .describe(
          "The shell command to execute as a single string. Examples: 'ls -la', 'git rev-parse --abbrev-ref HEAD', 'npm test'. Prefer read-only commands for discovery tasks.",
        ),
    }),
  },
};

export const singleTurnExecutor = async (data: EvalData) => {
  const messages = buildMessages(data);

  const tools: ToolSet = {};
  for (const toolName of data.tools) {
    const def = TOOL_DEFINITIONS[toolName];
    if (def) {
      tools[toolName] = tool({
        description: def.description,
        inputSchema: def.parameters,
      });
    }

    const { text, toolCalls } = await generateText({
      model: openai(data.config?.model || "gpt-5-mini"),
      messages,
      tools,
      stopWhen: stepCountIs(1),
      toolChoice: "auto",
      temperature: data.config?.temperature,
      providerOptions: {
        openai: {
          reasoningEffort: "high",
        },
      },
    });

    console.log("Generated text:", text);
    console.log("Tool calls:", toolCalls);

    const calls = toolCalls.map((tc) => ({
      toolName: tc.toolName,
      args: "args" in tc ? tc.args : {},
    }));
    const toolNames = toolCalls.map((tc) => tc.toolName);

    return {
      toolCalls: calls,
      toolNames,
      selectedAny: toolCalls.length > 0,
    } as SingleTurnResult;
  }
};

/**
 * Multi-turn executor with mocked tools.
 * Runs a complete agent loop with tools returning fixed values.
 */
export async function multiTurnWithMocks(
  data: MultiTurnEvalData,
): Promise<MultiTurnResult> {
  const tools = buildMockedTools(data.mockTools);

  // Build messages from either prompt or pre-filled history
  const messages: ModelMessage[] = data.messages ?? [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: data.prompt! },
  ];

  const result = await generateText({
    model: openai(data.config?.model ?? "gpt-5-mini"),
    messages,
    tools,
    stopWhen: stepCountIs(data.config?.maxSteps ?? 20),
  });

  // Extract all tool calls in order from steps
  const allToolCalls: string[] = [];
  const steps = result.steps.map((step) => {
    const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
      allToolCalls.push(tc.toolName);
      return {
        toolName: tc.toolName,
        args: "args" in tc ? tc.args : {},
      };
    });

    const stepToolResults = (step.toolResults ?? []).map((tr) => ({
      toolName: tr.toolName,
      result: "result" in tr ? tr.result : tr,
    }));

    return {
      toolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
      toolResults: stepToolResults.length > 0 ? stepToolResults : undefined,
      text: step.text || undefined,
    };
  });

  // Extract unique tools used
  const toolsUsed = [...new Set(allToolCalls)];

  return {
    text: result.text,
    steps,
    toolsUsed,
    toolCallOrder: allToolCalls,
  };
}
