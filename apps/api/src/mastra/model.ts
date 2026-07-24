import type { Env } from "../shared/env.js";

type ModelId = `${string}/${string}`;

export type AgentModel = ModelId | { id: ModelId; url: string };

export function resolveAgentModel(env: Env): AgentModel {
  const id = env.CURRICULUM_MODEL as ModelId;

  if (env.OPENROUTER_BASE_URL) {
    return { id, url: env.OPENROUTER_BASE_URL };
  }

  return id;
}
