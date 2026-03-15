import { evaluate } from "@lmnr-ai/lmnr";
import { toolOrderCorrect, toolsAvoided, llmJudge } from "./evaluators";
import type {
  MultiTurnDatasetEntry,
  MultiTurnEvalData,
  MultiTurnResult,
  MultiTurnTarget,
} from "./types.ts";
import dataset from "./data/agent-multiturn.json" with { type: "json" };

import { multiTurnWithMocks } from "./executors";
import { da } from "zod/locales";
import type { AnyTlsaRecord } from "dns";

const executor = async (data: MultiTurnEvalData) => {
  return await multiTurnWithMocks(data);
};

evaluate({
  name: "Agent Multi-turn Eval",
  data: dataset as any,
  executor,
  evaluators: {
    outputQuality: async (output, target) => {
      if (!target) return 1;
      const result = await llmJudge(output, target as MultiTurnTarget);
      return {
        [result.reason]: result.score,
      };
    },
  },
  config: {
    projectApiKey: process.env.LMNR_PROJECT_API_KEY || "",
  },
  groupName: "agent-multi-turn",
});
