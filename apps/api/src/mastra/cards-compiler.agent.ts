import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { resolveAgentModel } from "./model.js";

const INSTRUCTIONS = [
  "You COMPILE a set of review cards for a topic, for an architecture-judgment learning system.",
  "",
  "The learner is a senior developer moving into an architect role who generates a lot of code with AI.",
  "You are given the topic's title, its summary, and any gaps already known about it — use these as",
  "the established scope of what the topic covers. Do not introduce material outside that scope.",
  "",
  "Your job: identify the topic's key concepts (not just one narrow fact) and produce",
  "{ cards: [{ concept, variants: [{prompt, answer}] }] }.",
  "",
  "Rules:",
  "- Cover the topic's key concepts — enough to represent the whole topic, not a single detail.",
  "- Each card is one concept. Produce 3-5 variants per card that test the SAME underlying knowledge",
  "  but are DIFFERENTLY PHRASED — vary the structure and framing of the question, not just swap a",
  "  synonym. A variant's answer must reflect the same underlying fact/judgment as its siblings.",
  "- Frame every prompt and answer around judgment and tradeoffs — never syntax or API trivia.",
  "- If gaps are provided, make sure at least some cards target closing those specific gaps.",
].join("\n");

export function createCardsCompiler(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "cards-compiler",
    name: "Cards Compiler",
    instructions: INSTRUCTIONS,
    model: resolveAgentModel(env),
  });
}
