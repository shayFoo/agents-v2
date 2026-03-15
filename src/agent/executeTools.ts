import { tools, isToolExist } from "./tools/index.ts";

export const executeTool = async (toolName: string, args: any): Promise<string> => {
  if (!isToolExist(toolName)) {
    return `Tool "${toolName}" not found. use only the available tools.`;
  }
  const tool = tools[toolName];

  const execute = tool.execute;
  if (!execute) {
    return `Tool "${toolName}" does not have an execute function.`;
  }

  const result = await execute(args, {
    toolCallId: "",
    messages: [],
  });

  return String(result);
};
