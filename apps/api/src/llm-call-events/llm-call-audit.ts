import { computeCallCostUsd } from "../owner-stats/llm-pricing.js";
import type { LlmCallEventInput } from "./llm-call-events.repo.js";

export interface LlmCallAudit {
  knowledgeSourceId?: string | null;
  runId?: string | null;
  clusterId?: string | null;
}

interface AuditTokens {
  promptTokens: number | null;
  completionTokens: number | null;
}

type AuditFields = Pick<
  LlmCallEventInput,
  "knowledgeSourceId" | "runId" | "clusterId" | "outcome" | "costUsd"
>;

export function auditFieldsFor(
  audit: LlmCallAudit | undefined,
  modelId: string | null,
  tokens: AuditTokens,
  success: boolean,
): AuditFields {
  if (!audit) {
    return {};
  }

  return {
    knowledgeSourceId: audit.knowledgeSourceId ?? null,
    runId: audit.runId ?? null,
    clusterId: audit.clusterId ?? null,
    outcome: success ? "ok" : "failed",
    costUsd: computeCallCostUsd(modelId, tokens.promptTokens, tokens.completionTokens),
  };
}
