import { tool } from "ai";
import { z } from "zod";

export const getDateTime = tool({
  description: "Return the current date and time at the agent's location. Use this tool when current date or time is needed.",
  inputSchema: z.object({}),
  execute: async () => {
    return `The current date time in ISO format is: ${new Date().toISOString()}`;
  },
});
