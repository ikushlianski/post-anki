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
import { createDocResearchArchitect } from "./doc-research-architect.agent.js";
import { createStudyChatAgent } from "./study-chat.agent.js";
import { createStructureEditorAgent } from "./structure-editor.agent.js";
import { createLanguageChatAgent } from "./language-chat.agent.js";
import { createLectureSourceSelector } from "./lecture-source-selector.agent.js";
import { createLectureCompiler } from "./lecture-compiler.agent.js";
import { createPhraseBatchAgent, createGradeBatchAgent } from "./language-practice.agent.js";
import { createWritingCheckAgent } from "./writing-check.agent.js";
import { createSiblingDiscoveryAgent } from "./sibling-discovery.agent.js";
import { createDomainPriorityReviewAgent } from "./domain-priority-review.agent.js";
import { createDocScanAgent } from "./doc-scan.agent.js";
import { createDomainTaxonomyMappingAgent } from "./domain-taxonomy-mapping.agent.js";
import { createLearningListClassifierAgent } from "./learning-list-classifier.agent.js";
import { createLearningListSliceAgent } from "./learning-list-slice.agent.js";
import { createStudyMaterialWriter } from "./study-material-writer.agent.js";

export const AGENT_KEYS = {
  curriculumArchitect: "curriculumArchitect",
  mentorAsk: "mentorAsk",
  mentorEval: "mentorEval",
  decide: "decide",
  probeQuizBatch: "probeQuizBatch",
  socraticEval: "socraticEval",
  docResearchArchitect: "docResearchArchitect",
  studyChat: "studyChat",
  structureEditor: "structureEditor",
  languageChat: "languageChat",
  lectureSourceSelector: "lectureSourceSelector",
  lectureCompiler: "lectureCompiler",
  phraseBatchGenerate: "phraseBatchGenerate",
  gradeBatch: "gradeBatch",
  writingCheck: "writingCheck",
  siblingDiscovery: "siblingDiscovery",
  domainPriorityReview: "domainPriorityReview",
  docScan: "docScan",
  domainTaxonomyMapping: "domainTaxonomyMapping",
  learningListClassifier: "learningListClassifier",
  learningListSlice: "learningListSlice",
  studyMaterialWriter: "studyMaterialWriter",
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
        [AGENT_KEYS.docResearchArchitect]: createDocResearchArchitect(),
        [AGENT_KEYS.studyChat]: createStudyChatAgent(),
        [AGENT_KEYS.structureEditor]: createStructureEditorAgent(),
        [AGENT_KEYS.languageChat]: createLanguageChatAgent(),
        [AGENT_KEYS.lectureSourceSelector]: createLectureSourceSelector(),
        [AGENT_KEYS.lectureCompiler]: createLectureCompiler(),
        [AGENT_KEYS.phraseBatchGenerate]: createPhraseBatchAgent(),
        [AGENT_KEYS.gradeBatch]: createGradeBatchAgent(),
        [AGENT_KEYS.writingCheck]: createWritingCheckAgent(),
        [AGENT_KEYS.siblingDiscovery]: createSiblingDiscoveryAgent(),
        [AGENT_KEYS.domainPriorityReview]: createDomainPriorityReviewAgent(),
        [AGENT_KEYS.docScan]: createDocScanAgent(),
        [AGENT_KEYS.domainTaxonomyMapping]: createDomainTaxonomyMappingAgent(),
        [AGENT_KEYS.learningListClassifier]: createLearningListClassifierAgent(),
        [AGENT_KEYS.learningListSlice]: createLearningListSliceAgent(),
        [AGENT_KEYS.studyMaterialWriter]: createStudyMaterialWriter(),
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
