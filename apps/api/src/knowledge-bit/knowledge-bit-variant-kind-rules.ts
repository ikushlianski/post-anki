import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";

export const ANKI_VARIANT_KIND_PREFERENCE = [
  "basic",
  "cloze",
  "fill_in_the_blank",
  "wh_question",
  "list_overview",
  "list_step",
  "list_next",
] as const satisfies readonly KnowledgeBitQuestionVariantKind[];

export const TYPED_VARIANT_KINDS = ["wh_question", "fill_in_the_blank"] as const satisfies readonly KnowledgeBitQuestionVariantKind[];

export function ankiVariantKindRank(kind: KnowledgeBitQuestionVariantKind): number {
  return ANKI_VARIANT_KIND_PREFERENCE.indexOf(kind);
}

export function isTypedVariantKind(kind: string): boolean {
  return (TYPED_VARIANT_KINDS as readonly string[]).includes(kind);
}
