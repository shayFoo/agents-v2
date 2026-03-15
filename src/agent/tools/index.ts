import { getDateTime } from "./dateTime.ts";
import { readFile, deleteFile, listFiles, writeFile } from "./file.ts";
import { web_search } from "./webSearch.ts";
import { runCommand } from "./shell.ts";
import { executeCode } from "./executeCode.ts";
// All tools combined for the agent

export const tools = {
  getDateTime,
  readFile,
  deleteFile,
  listFiles,
  writeFile,
  web_search,
  runCommand,
  executeCode,
};

export type ToolName = keyof typeof tools;

export const isToolExist = (toolName: string): toolName is ToolName => {
  return toolName in tools;
};

export const fileTools = {
  readFile,
  deleteFile,
  listFiles,
  writeFile,
};
