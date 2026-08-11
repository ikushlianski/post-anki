import type { StudyMaterialKind } from "@post-anki/shared";

const KIND_INSTRUCTIONS: Record<StudyMaterialKind, string> = {
  worked_example:
    "Produce ONE worked example: a concrete, step-by-step walkthrough that applies this topic's core " +
    "idea to a realistic scenario, grounded only in the material below.",
  analogy:
    "Produce ONE analogy: a clear, accurate comparison that makes this topic's core idea intuitive, " +
    "grounded only in the material below.",
};

export function buildStudyMaterialPrompt(
  kind: StudyMaterialKind,
  topicTitle: string,
  groundingText: string,
  citations: string[],
): string {
  return [
    `Topic: ${topicTitle}`,
    "",
    KIND_INSTRUCTIONS[kind],
    "",
    "Grounding material actually gathered for this request (do not go beyond what it supports):",
    groundingText,
    "",
    "Citation URLs actually available for this material (cite only from this list; if empty, cite nothing):",
    citations.length > 0 ? citations.join("\n") : "(none)",
  ].join("\n");
}
