import type { RequestContext } from "@mastra/core/request-context";
import type { Env } from "../shared/env.js";
import { resolveEffectiveModelTier } from "./tier-resolver.js";
import { tierToModelId } from "./model-tier.js";

type ModelId = `${string}/${string}`;

export type AgentModel = ModelId | { id: ModelId; url: string };

// cost-tier-model-selection — resolveAgentModel is now a pure deriver: it
// only turns an already-resolved model id (from tierToModelId, itself fed
// by resolveEffectiveModelTier) into the shape Mastra's Agent constructor
// wants. It no longer reads env.CURRICULUM_MODEL itself — every caller
// passes a resolved id explicitly.
export function resolveAgentModel(modelId: string, baseUrl?: string): AgentModel {
  const id = modelId as ModelId;

  if (baseUrl) {
    return { id, url: baseUrl };
  }

  return id;
}

// The one shared `model:` field every createXxxAgent() passes to its Agent
// constructor. Mastra calls this per-generate/stream call with the live
// requestContext (DynamicArgument), so a subject/curriculum-scoped call site
// that sets `subjectId`/`curriculumId` on its requestContext gets the
// cascaded tier; every other call site (mentor, decide, socratic, ...) has
// no such context set and falls straight through to the global default —
// same resolver, same map, no per-agent branching needed.
export function dynamicResolvedModel(env: Env): (args: {
  requestContext?: RequestContext<any>;
}) => Promise<AgentModel> {
  return async ({ requestContext }) => {
    const subjectId = requestContext?.get("subjectId") as string | undefined;
    const curriculumId = requestContext?.get("curriculumId") as string | undefined;
    const tier = await resolveEffectiveModelTier({ subjectId, curriculumId });

    return resolveAgentModel(tierToModelId(tier), env.OPENROUTER_BASE_URL);
  };
}
