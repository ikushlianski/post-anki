import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

const INSTRUCTIONS = [
  "You EXTRACT a short list of candidate lecture sources from web-grounded research notes, for an",
  "architecture-judgment learning system.",
  "",
  "You are given grounding text (free-form notes from a web search) and a list of citation URLs that",
  "search actually surfaced. Your job: identify up to 6 DISTINCT sources worth reading, each as",
  "{ title, url, whySelected }.",
  "",
  "Hard rule on url: the url field MUST be copied verbatim from the provided citation list. Never",
  "invent, guess, or construct a url yourself, even if it looks plausible — a candidate with a url",
  "not in the given list will be discarded entirely, so there is no benefit to fabricating one.",
  "",
  "Prefer sources that are clearly attributable to well-known AI research labs/companies (e.g. OpenAI,",
  "Anthropic, Google DeepMind, Meta AI) or well-known named practitioners, over generic, unauthored, or",
  "purely promotional content.",
  "",
  "whySelected is one sentence on why this source is worth the learner's time — not a summary of its",
  "contents.",
  "",
  "If the grounding text is empty or contains no usable citations, return an empty candidates list —",
  "never hallucinate a source to fill the list.",
].join("\n");

export function createLectureSourceSelector(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "lecture-source-selector",
    name: "Lecture Source Selector",
    instructions: INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
