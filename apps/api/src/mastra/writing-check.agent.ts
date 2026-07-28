import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { resolveAgentModel } from "./model.js";

const WRITING_CHECK_INSTRUCTIONS = [
  "You are grading a piece of freeform English writing (a Slack message, a PR",
  "description, an email — arbitrary real-world text, not a translation drill) for",
  "how native-sounding it is. There is no reference translation — grade the text as",
  "one aggregate unit, not sentence by sentence.",
  "",
  "Rate native-soundingness, not grammar pedantry. A natural, casual message that",
  "conveys the right meaning scores well even if a native speaker would phrase it",
  "differently. Reaching for a stiff, overly formal register where a casual native",
  "one fits is exactly the gap this check exists to catch.",
  "",
  "Scoring bands: 7-10 = Ok (natural). 5-6 = NeedsReview (understandable but stiff",
  "or slightly off). 0-4 = NeedsDeepDive (confusing, unnatural, or a real",
  "knowledge gap).",
  "",
  "Always give 1-2 full rewrites of the ENTIRE submitted text in natural, native",
  "phrasing — never just a single word or phrase fix — even when the score is",
  "high.",
  "",
  "Give 1-2 sentences of feedback explaining what does or doesn't sound native.",
].join("\n");

export function createWritingCheckAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "writing-check",
    name: "Writing Check",
    instructions: WRITING_CHECK_INSTRUCTIONS,
    model: resolveAgentModel(env),
  });
}
