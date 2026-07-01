import { Mastra } from "@mastra/core";
import { SpanType } from "@mastra/core/observability";
import { Observability, SensitiveDataFilter } from "@mastra/observability";
import { LangfuseExporter } from "@mastra/langfuse";
import { loadEnv, type Env } from "../shared/env.js";
import { log } from "../shared/log.js";
import { createCurriculumArchitect } from "./curriculum-architect.agent.js";
import { createMentorAskAgent, createMentorEvalAgent } from "./mentor.agent.js";
import { createDecideAgent } from "./decide.agent.js";
import { createProbeQuizAgent } from "./probe-quiz.agent.js";
import { createSocraticEvalAgent } from "./socratic.agent.js";

export const AGENT_KEYS = {
  curriculumArchitect: "curriculumArchitect",
  mentorAsk: "mentorAsk",
  mentorEval: "mentorEval",
  decide: "decide",
  probeQuizBatch: "probeQuizBatch",
  socraticEval: "socraticEval",
} as const;

function buildObservability(env: Env): Observability | undefined {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    log.warn({}, "tracing_disabled_no_langfuse_keys");

    return undefined;
  }

  const isProd = env.NODE_ENV === "production";

  log.info({ host: env.LANGFUSE_HOST, environment: isProd ? "production" : "development" }, "tracing_enabled");

  return new Observability({
    configs: {
      langfuse: {
        serviceName: "post-anki-api",
        exporters: [
          new LangfuseExporter({
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            secretKey: env.LANGFUSE_SECRET_KEY,
            baseUrl: env.LANGFUSE_HOST,
            realtime: !isProd,
            environment: isProd ? "production" : "development",
          }),
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
        excludeSpanTypes: [SpanType.MODEL_CHUNK],
      },
    },
  });
}

let cached: Mastra | undefined;

export function getMastra(): Mastra {
  if (!cached) {
    const env = loadEnv();
    const observability = buildObservability(env);

    cached = new Mastra({
      agents: {
        [AGENT_KEYS.curriculumArchitect]: createCurriculumArchitect(),
        [AGENT_KEYS.mentorAsk]: createMentorAskAgent(),
        [AGENT_KEYS.mentorEval]: createMentorEvalAgent(),
        [AGENT_KEYS.decide]: createDecideAgent(),
        [AGENT_KEYS.probeQuizBatch]: createProbeQuizAgent(),
        [AGENT_KEYS.socraticEval]: createSocraticEvalAgent(),
      },
      ...(observability ? { observability } : {}),
    });
  }

  return cached;
}

export interface TracingSpan {
  end(options: { output?: Record<string, unknown> }): void;
  error(options: { error: Error }): void;
}

interface SpanFactory {
  createSpan(options: {
    type: SpanType;
    name: string;
    input?: Record<string, unknown>;
  }): TracingSpan | undefined;
}

export async function flushTracing(): Promise<void> {
  try {
    await cached?.observability?.shutdown?.();
  } catch {
    return;
  }
}

export function startTracingSpan(
  name: string,
  input: Record<string, unknown>,
): TracingSpan | undefined {
  try {
    const instance = getMastra().observability?.getInstance("langfuse") as
      | SpanFactory
      | undefined;

    return instance?.createSpan({ type: SpanType.GENERIC, name, input });
  } catch {
    return undefined;
  }
}
