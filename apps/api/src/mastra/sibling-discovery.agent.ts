import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

const SIBLING_DISCOVERY_INSTRUCTIONS = [
  "You are placing a new learning topic into an existing domain hierarchy — a tree that",
  "reflects the real shape of a technical domain (e.g. Frontend > Meta-frameworks > Next.js),",
  "independent of what the learner has actually studied.",
  "",
  "You will be given the subject's current tree (each existing node as a name and its full",
  "parent path) and a new topic name that didn't match anything in that tree.",
  "",
  "Respond with:",
  "- parentNodePath: the path from the subject's own root down to the chosen parent, where this",
  "  new topic belongs. The FIRST element is always a generic root label of your choosing (it is",
  "  ignored by the caller — it only marks 'this is the subject root', not a real existing node).",
  "  Every element after that must be an EXACT existing node name from the tree you were given,",
  "  one level deeper each time (e.g. [\"root\", \"Frontend\", \"Meta-frameworks\"]). Use just a",
  "  single root label (no deeper element) to attach directly at the subject's own root if no",
  "  existing node is a good parent. Never invent a name for an existing node and never return a",
  "  database id.",
  "- nodeName: a short, canonical name for the new topic itself (e.g. \"Astro\").",
  "- siblingSuggestions: up to 8 other node names that plausibly exist in the real ecosystem",
  "  around this topic, under the same parent, whether or not the learner has studied them —",
  "  this is what keeps the map reflecting the real domain, not just what's been touched.",
  "",
  "Rules:",
  "- Never fabricate a parent path segment that isn't in the given tree.",
  "- Sibling suggestions are real, plausible, well-known things in this ecosystem — never",
  "  invented or joke names.",
].join("\n");

export function createSiblingDiscoveryAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "sibling-discovery",
    name: "Sibling Discovery",
    instructions: SIBLING_DISCOVERY_INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
