import { tool } from "ai";
import { z } from "zod";
import shell from "shelljs";

export const runCommand = tool({
  description:
    "Execute a shell command and return its output. Use this for system operations, running scripts, or interacting with the operating system.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    const result = shell.exec(command, { silent: true });

    let out = "";
    if (result.stdout) {
      out += result.stdout;
    }
    if (result.stderr) {
      out += result.stderr;
    }
    if (result.code !== 0) {
      return `Command failed (exist code ${result.code}):\n ${out}`;
    }

    return out || "Command completed successfully (no output)";
  },
});
