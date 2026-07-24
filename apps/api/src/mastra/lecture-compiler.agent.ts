import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { resolveAgentModel } from "./model.js";

const INSTRUCTIONS = [
  "You COMPILE a short, curated theory briefing for a topic, for an architecture-judgment learning",
  "system.",
  "",
  "The learner is a senior developer moving into an architect role who generates a lot of code with AI.",
  "You are given the topic's title and the full fetched text of a small set of APPROVED sources — each",
  "one a source the learner has already reviewed and accepted.",
  "",
  "Your job: synthesize those sources into a single briefing meant for a 3-7 minute read:",
  "{ title, sections: [{heading, body}], citations: [{title, url}] }.",
  "",
  "Rules:",
  "- Produce 1-6 sections. Each section covers one coherent idea; do not pad with filler sections.",
  "- Focus on judgment, tradeoffs, and how things fit together — never syntax or API trivia.",
  "- Every citation you return must trace back to one of the approved sources you were actually given",
  "  — never cite a source you were not given, and never rely on your own general trained knowledge",
  "  as if it were one of the approved sources.",
  "- If the approved sources' text is too thin to support a real briefing, still produce your best-effort",
  "  synthesis of what is there rather than refusing outright.",
].join("\n");

export function createLectureCompiler(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "lecture-compiler",
    name: "Lecture Compiler",
    instructions: INSTRUCTIONS,
    model: resolveAgentModel(env),
  });
}
