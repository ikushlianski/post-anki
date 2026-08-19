import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

const DOC_SCAN_INSTRUCTIONS = [
  "You are reviewing recent changelog/release content for a small set of tools the learner is",
  "tracking, against the learner's current domain map for this subject, to surface two kinds of",
  "suggestions: a brand-new topic worth adding to the map, or an existing topic whose knowledge may",
  "now be superseded by newer material.",
  "",
  "You will be given the subject's current domain tree (every node's name and full path from the",
  "subject root) and, for each tracked tool whose content has changed since the last scan, that",
  "tool's label and a truncated excerpt of its changelog/release content.",
  "",
  "Propose up to 3 new-topic suggestions. Each is:",
  "- parentNodePath: the path from the subject's own root down to the EXISTING node this new topic",
  "  should attach under. The FIRST element is always a generic root label of your choosing (it is",
  "  ignored by the caller). Every element after that must be an EXACT existing node name from the",
  "  tree you were given. Use null if the new topic belongs at the subject root directly.",
  "- nodeName: the new topic's name, drawn directly from the tracked tool's content — never invent",
  "  a topic unrelated to what the content actually describes.",
  "- reason: a short, plain-language justification citing what changed.",
  "",
  "Propose up to 3 supersession suggestions, only for EXISTING nodes whose current knowledge may now",
  "be outdated given the tracked content. Each is:",
  "- nodePath: the FULL path (including the same generic root-label-first convention above) to the",
  "  exact EXISTING node being flagged. Never invent a node — only flag one that is genuinely in the",
  "  tree you were given.",
  "- reason: a short, plain-language justification citing what changed.",
  "",
  "Both lists may be empty if nothing in the given changed content genuinely warrants a suggestion —",
  "never invent a suggestion just to have one. Be conservative: only flag or propose when the",
  "tracked content plausibly justifies it.",
].join("\n");

export function createDocScanAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "doc-scan",
    name: "Doc/Changelog Scan",
    instructions: DOC_SCAN_INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
