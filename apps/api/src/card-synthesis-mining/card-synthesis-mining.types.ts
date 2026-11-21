export interface EvidenceCard {
  id: string;
  question: string;
  answer: string;
}

export interface AliasedCards {
  prompt: string;
  aliases: Map<string, EvidenceCard>;
}

export interface ClassifierVerdict {
  isChain: boolean;
  title: string;
  reason: string;
}

export interface OverviewStep {
  technique: string;
  text: string;
  evidenceBitIds: string[];
}

export interface OverviewDraft {
  lead: string;
  steps: OverviewStep[];
}

export interface OverviewCard {
  front: string;
  back: string;
  example: string;
  evidenceBitIds: string[];
  evidenceLink: { bitId: string; snippet: string }[];
}

export type MiningOutcome =
  | "synthesized"
  | "not_chain"
  | "duplicate_existing"
  | "rejected_ungrounded"
  | "failed"
  | "failed_retryable"
  | "failed_budget"
  | "skipped_cap"
  | "skipped_breaker"
  | "skipped_disabled"
  | "skipped_gate";

export interface MineResult {
  outcome: MiningOutcome;
  clusterId: string;
  sourceId: string | null;
  bitId: string | null;
}

export class UngroundedOverviewError extends Error {
  constructor(reason: string) {
    super(`card_synthesis_ungrounded: ${reason}`);
  }
}
