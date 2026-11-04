import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_BIT_ALL_REJECT_REASONS,
  KNOWLEDGE_BIT_LEGACY_REJECT_REASONS,
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS,
  knowledgeBitFeedbackReasonSchema,
  knowledgeBitRejectReasonSchema,
  updateKnowledgeBitFeedbackInput,
} from "./knowledge-bit-review-feedback";

describe("knowledge bit reject reasons", () => {
  it("should offer exactly seven reasons for new rejections", () => {
    expect(KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS).toHaveLength(7);
  });

  it("should keep older rows readable by parsing every legacy code", () => {
    for (const code of KNOWLEDGE_BIT_LEGACY_REJECT_REASONS) {
      expect(knowledgeBitRejectReasonSchema.safeParse(code).success).toBe(true);
    }
  });

  it("should not offer legacy-only codes for new rejections", () => {
    for (const code of KNOWLEDGE_BIT_LEGACY_REJECT_REASONS) {
      expect(KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS).not.toContain(code);
    }
  });

  it("should accept a legacy code from an older app build on feedback update", () => {
    expect(updateKnowledgeBitFeedbackInput.safeParse({ reasonCode: "meta_wording" }).success).toBe(true);
  });

  it("should label every reason code including unspecified", () => {
    for (const code of knowledgeBitFeedbackReasonSchema.options) {
      expect(KNOWLEDGE_BIT_REJECT_REASON_LABELS[code]).toBeTruthy();
    }

    expect(KNOWLEDGE_BIT_ALL_REJECT_REASONS).toHaveLength(15);
  });

  it("should reject unknown codes", () => {
    expect(knowledgeBitRejectReasonSchema.safeParse("nope").success).toBe(false);
  });
});
