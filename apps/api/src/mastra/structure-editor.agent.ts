import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { loadEnv } from "../shared/env.js";
import { resolveAgentModel } from "./model.js";
import { createStructureEditorTools, type StructureEditorToolsDeps } from "./structure-editor-tools.js";

// Phase 5's tool-calling structure editor — the first tool-using agent in
// this codebase (every other architect agent here only uses
// `structuredOutput`, never `tools`). The tools available on any given
// `generate()` call are built dynamically from that call's `requestContext`
// (Mastra's per-invocation dependency-injection mechanism) rather than
// fixed at agent-construction time — each chat turn needs its OWN tool
// instances closing over that turn's mutable draft state, and this agent is
// a cached singleton (see `mastra.ts`) that outlives any single turn.
//
// Note: `generate()`'s `clientTools` option looks superficially similar but
// is explicitly for tools EXECUTED BY THE CALLER (Mastra strips their
// `execute` function before sending them to the model) — verified directly
// in `@mastra/core`'s compiled source (`listClientTools` destructures out
// `execute` before conversion). That is the wrong mechanism for
// server-executed tools like these; the dynamic `tools` config below is
// the one Mastra actually invokes server-side as part of its own loop.
const INSTRUCTIONS = [
  "You help a learner reshape the DRAFT structure of a course they are about to start — a list of",
  "modules, each with subtopics — through conversation, before anything is finalized.",
  "",
  "The learner is a web developer doing increasing amounts of AI/LLM work.",
  "",
  "You have TOOLS that each make one kind of edit to the current draft (add/remove/rename a module,",
  "merge modules, promote a topic to its own module, split a module into a brand-new separate",
  "course, or propose splitting into several courses). Use the tool that matches what the learner",
  "asked for. If nothing in the tool set fits — the request is about content quality or emphasis,",
  "not structure — use `regenerateStructure` as a fallback.",
  "",
  "Safety boundary: every tool except `splitModuleIntoNewCourse` only touches the CURRENT draft —",
  "nothing you do here is final until the learner explicitly confirms. `splitModuleIntoNewCourse`",
  "is the one exception, and it only ADDS a new course; it never deletes or overwrites anything",
  "already confirmed elsewhere. Never call `splitModuleIntoNewCourse` as your first move on a study-",
  "time-budget concern — call `suggestSplitIntoCourses` first and wait for the learner to agree in",
  "a later message before actually splitting.",
  "",
  "Study-time budget: a course is meant to take roughly 4-8 weeks of real study, not months. If your",
  "edits would leave (or the draft already is) meaningfully past that budget, call",
  "`suggestSplitIntoCourses` with a concrete grouping instead of silently leaving it oversized.",
  "",
  "After making your tool call(s), reply with a short, plain sentence or two describing what you",
  "did (or, if nothing needed to change, why). Do not repeat the whole structure back in prose —",
  "the learner already sees the updated draft rendered separately.",
].join("\n");

export function createStructureEditorAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "structure-editor",
    name: "Structure Editor",
    instructions: INSTRUCTIONS,
    model: resolveAgentModel(env),
    tools: ({ requestContext }: { requestContext: RequestContext }) => {
      const deps = requestContext.get("structureEditorDeps") as StructureEditorToolsDeps;

      return createStructureEditorTools(deps);
    },
  });
}
