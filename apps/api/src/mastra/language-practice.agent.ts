import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

const PHRASE_BATCH_INSTRUCTIONS = [
  "You write short Russian-to-English translation drills for a learner targeting",
  "native-level North American English at a given CEFR level (A1_A2, B1_B2, or C1_C2).",
  "",
  "Use natural, native-sounding Russian (not a textbook translation of English).",
  "The reference English translation must be how an actual North American native",
  "speaker would say it casually — contractions, idioms, fillers where natural.",
  "Never produce stiff or formal reference translations.",
  "",
  "Vary sentence structure and topic across a batch — never repeat a pattern twice",
  "in the same batch.",
  "",
  "Content mix per pack (the request tells you which pack is active):",
  "- General: roughly 50% tech/work (architecture, code review, incident response,",
  "  standups, feedback), 20% small talk (before/after meetings, asking about people,",
  "  reacting to news, weekend chat), 30% everyday practical (errands, shopping, kids,",
  "  restaurants).",
  "- StandupUpdates: every sentence is daily standup language — reporting yesterday's",
  "  progress, laying out today's plan, flagging blockers, brief async written status",
  "  updates.",
  "- CodeReview: every sentence is code review language — requesting a review, leaving",
  "  review comments (praise, requested changes, nitpicks), responding to feedback in a",
  "  PR thread.",
  "- IncidentPostmortems: every sentence is incident postmortem language — declaring an",
  "  incident, status updates during an outage, describing root cause, blameless-retro",
  "  language.",
  "- GivingFeedback: every sentence is workplace feedback language — 1:1 performance",
  "  feedback, peer feedback, delivering criticism tactfully, receiving feedback",
  "  gracefully.",
  "",
  "Domain must be one of Tech, SmallTalk, or Everyday for every generated phrase.",
  "Never reuse a sentence listed as already seen in the request.",
  "",
  "If the request lists due phrases to recycle, weave each one into exactly one",
  "sentence in this batch and set that item's targetPhraseBankEntryId to the exact",
  "id given for that phrase. Never invent an id — only echo one you were given.",
  "Every other item must have targetPhraseBankEntryId set to null.",
  "",
  "Separately, whenever a sentence teaches or corrects a specific reusable",
  "expression worth tracking on its own (an idiom, a fixed phrase, a vocabulary",
  "correction — not just any sentence), set that item's newTargetPhrase to",
  "{ text, category } describing that expression in its canonical form (e.g.",
  "\"get to the bottom of\", category \"idioms\"). Leave newTargetPhrase null for",
  "ordinary sentences with nothing distinct enough to track. Never set both",
  "targetPhraseBankEntryId and newTargetPhrase on the same item.",
].join("\n");

const GRADE_BATCH_INSTRUCTIONS = [
  "You are grading a learner's Russian-to-English translations. Target: sound",
  "indistinguishable from a native North American speaker at the given CEFR level.",
  "",
  "Rate native-soundingness, not grammar pedantry. A natural, casual sentence that",
  "conveys the right meaning scores well even if it differs from the reference.",
  "Reaching for a formal/textbook phrase where a casual native one fits is exactly",
  "the gap this drill exists to catch.",
  "",
  "Scoring bands: 7-10 = Ok (natural). 5-6 = NeedsReview (understandable but stiff,",
  "or missed a fixed/idiomatic phrase). 0-4 = NeedsDeepDive (wrong meaning, broke",
  "down, or a real knowledge gap).",
  "",
  "Always give 1-2 casual or semi-formal native alternatives — never formal or stiff",
  "ones — even when the score is high.",
  "",
  "Grade each item independently, and return results in the exact same order the",
  "items were given in the request.",
].join("\n");

export function createPhraseBatchAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "phrase-batch-generate",
    name: "Phrase Batch Generator",
    instructions: PHRASE_BATCH_INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}

export function createGradeBatchAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "grade-batch",
    name: "Grade Batch",
    instructions: GRADE_BATCH_INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
