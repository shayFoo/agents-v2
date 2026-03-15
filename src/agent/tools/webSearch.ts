import { openai } from "@ai-sdk/openai";

export const web_search = openai.tools.webSearch({
  userLocation: {
    type: "approximate",
    country: "JP",
  },
});
