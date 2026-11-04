import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BIT_ALL_REJECT_REASONS, KNOWLEDGE_BIT_REJECT_REASON_LABELS } from "./knowledge-bit-review-feedback";
import {
  REJECT_REASON_CODES_BY_SUBJECT_TYPE,
  REJECT_SUBJECT_TYPES,
  isRejectReasonAllowedForSubjectType,
} from "./reject-reasons-by-subject-type";

describe("reject reasons by subject type", () => {
  it("should offer only codes that are valid and labelled for every subject type", () => {
    for (const type of REJECT_SUBJECT_TYPES) {
      for (const code of REJECT_REASON_CODES_BY_SUBJECT_TYPE[type]) {
        expect(KNOWLEDGE_BIT_ALL_REJECT_REASONS).toContain(code);
        expect(KNOWLEDGE_BIT_REJECT_REASON_LABELS[code]).toBeTruthy();
      }
    }
  });

  it("should ask language cards which phrase the front targets, and code cards for missing context", () => {
    expect(REJECT_REASON_CODES_BY_SUBJECT_TYPE.language).toContain("front_unclear_target_phrase");
    expect(REJECT_REASON_CODES_BY_SUBJECT_TYPE.programming).toContain("no_code_context");
    expect(REJECT_REASON_CODES_BY_SUBJECT_TYPE.programming).not.toContain("front_unclear_target_phrase");
  });

  it("should end every list with other", () => {
    for (const type of REJECT_SUBJECT_TYPES) {
      expect(REJECT_REASON_CODES_BY_SUBJECT_TYPE[type].at(-1)).toBe("other");
    }
  });

  it("should still accept every pre-existing code for any type but refuse another type's new code", () => {
    expect(isRejectReasonAllowedForSubjectType("programming", "wrong_language")).toBe(true);
    expect(isRejectReasonAllowedForSubjectType("business", "meta_wording")).toBe(true);
    expect(isRejectReasonAllowedForSubjectType("language", "no_code_context")).toBe(false);
    expect(isRejectReasonAllowedForSubjectType("programming", "front_unclear_target_phrase")).toBe(false);
  });
});
