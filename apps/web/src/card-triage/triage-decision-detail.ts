import type {
  KnowledgeBitRejectReason,
  PutTriageDecisionInput,
  TriageDecision,
} from '@post-anki/shared'

export interface TriageDecisionDetail {
  note?: string | null
  reasonCode?: KnowledgeBitRejectReason | null
  dwellMs?: number
}

export type TriageDecisionDetails = Record<string, TriageDecisionDetail>

export function toTriageDecision(
  bitId: string,
  verdict: TriageDecision['verdict'],
  detail: TriageDecisionDetail = {},
): TriageDecision {
  return {
    bitId,
    verdict,
    ...(detail.note ? { note: detail.note } : {}),
    ...(verdict === 'rejected' && detail.reasonCode ? { reasonCode: detail.reasonCode } : {}),
    ...(detail.dwellMs !== undefined ? { dwellMs: detail.dwellMs } : {}),
  }
}

export function toPutBody(decision: TriageDecision, clearEmpty = false): PutTriageDecisionInput {
  const rejected = decision.verdict === 'rejected'

  return {
    verdict: decision.verdict,
    ...(decision.note ? { note: decision.note } : clearEmpty ? { note: null } : {}),
    ...(rejected && decision.reasonCode
      ? { reasonCode: decision.reasonCode }
      : rejected && clearEmpty
        ? { reasonCode: null }
        : {}),
    ...(decision.dwellMs !== undefined ? { dwellMs: decision.dwellMs } : {}),
  }
}
