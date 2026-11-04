import { z } from "zod";
import {
  KNOWLEDGE_BIT_LEGACY_REJECT_REASONS,
  KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS,
  type KnowledgeBitRejectReason,
} from "./knowledge-bit-review-feedback";

export const REJECT_SUBJECT_TYPES = ["programming", "language", "business", "other"] as const;

export const rejectSubjectTypeSchema = z.enum(REJECT_SUBJECT_TYPES);

export type RejectSubjectType = z.infer<typeof rejectSubjectTypeSchema>;

const COMMON_REASONS = KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS.filter((code) => code !== "wrong_language");

export const REJECT_REASON_CODES_BY_SUBJECT_TYPE: Record<RejectSubjectType, readonly KnowledgeBitRejectReason[]> = {
  programming: [...COMMON_REASONS.filter((code) => code !== "other"), "no_code_context", "too_trivial", "outdated_api", "other"],
  language: [
    ...COMMON_REASONS.filter((code) => code !== "other"),
    "wrong_language",
    "front_unclear_target_phrase",
    "other",
  ],
  business: [...COMMON_REASONS.filter((code) => code !== "other"), "too_trivial", "other"],
  other: [...COMMON_REASONS.filter((code) => code !== "other"), "too_trivial", "other"],
};

export function rejectReasonCodesForSubjectType(type: RejectSubjectType): readonly KnowledgeBitRejectReason[] {
  return REJECT_REASON_CODES_BY_SUBJECT_TYPE[type];
}

const PRE_EXISTING_CODES: ReadonlySet<string> = new Set<string>([
  ...KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS,
  ...KNOWLEDGE_BIT_LEGACY_REJECT_REASONS,
]);

export function isRejectReasonAllowedForSubjectType(type: RejectSubjectType, code: string): boolean {
  return PRE_EXISTING_CODES.has(code) || REJECT_REASON_CODES_BY_SUBJECT_TYPE[type].some((allowed) => allowed === code);
}
