import type { PendingKnowledgeBitQuestionVariant } from "@post-anki/shared";

export const TRIAGE_MAX_SHOWN = 9;

const KIND_PREFERENCE = ["basic", "fill_in_the_blank", "wh_question"];

const KIND_LABELS: Record<string, string> = {
  wh_question: "Question",
  fill_in_the_blank: "Fill in the gap",
  basic: "Basic",
};

type Variant = Pick<PendingKnowledgeBitQuestionVariant, "id" | "kind">;

function rank(kind: string): number {
  const index = KIND_PREFERENCE.indexOf(kind);

  return index === -1 ? KIND_PREFERENCE.length : index;
}

export function shownVariants<T extends Variant>(variants: T[]): T[] {
  const best = variants.reduce<T | null>(
    (acc, variant) =>
      acc === null || rank(variant.kind) < rank(acc.kind) ? variant : acc,
    null,
  );

  if (!best) {
    return [];
  }

  return [best, ...variants.filter((variant) => variant !== best)].slice(
    0,
    TRIAGE_MAX_SHOWN,
  );
}

export function bestVariantId(variants: Variant[]): string | null {
  return shownVariants(variants)[0]?.id ?? null;
}

export function keepIds(
  variants: Variant[],
  selected: string[] | undefined,
): string[] {
  const shown = shownVariants(variants).map((variant) => variant.id);

  if (!selected) {
    return shown;
  }

  const chosen = shown.filter((id) => selected.includes(id));

  return chosen.length > 0 ? chosen : shown.slice(0, 1);
}

export function keepsEveryVariant(
  variants: Variant[],
  selected: string[] | undefined,
): boolean {
  return keepIds(variants, selected).length === variants.length;
}

export function variantLabel(variants: Variant[], index: number): string {
  const variant = variants[index];

  if (!variant) {
    return "";
  }

  if (
    variants.slice(0, index).some((earlier) => earlier.kind === variant.kind)
  ) {
    return "Reworded";
  }

  return KIND_LABELS[variant.kind] ?? variant.kind;
}

export function toggleVariant(
  variants: Variant[],
  selected: string[] | undefined,
  index: number,
): string[] {
  const current = keepIds(variants, selected);
  const id = index === 0 ? undefined : shownVariants(variants)[index]?.id;

  if (!id) {
    return current;
  }

  return current.includes(id)
    ? current.filter((existing) => existing !== id)
    : [...current, id];
}
