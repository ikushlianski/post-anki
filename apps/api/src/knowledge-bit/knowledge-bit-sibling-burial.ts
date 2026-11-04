import type { KnowledgeBitBuriedSibling } from "../db/schema.js";

export interface SiblingBurialRow {
  reviewCount: number;
  dueAt: Date;
  suspendedAt: Date | null;
  buriedUntil: Date | null;
}

export interface SiblingBurialInput {
  gradedKey: string;
  activeKeys: string[];
  rows: Map<string, SiblingBurialRow>;
  buryUntil: Date;
}

export function deriveSiblingBurial(input: SiblingBurialInput): KnowledgeBitBuriedSibling[] {
  const { gradedKey, activeKeys, rows, buryUntil } = input;
  const buried: KnowledgeBitBuriedSibling[] = [];

  for (const cardKey of activeKeys) {
    const row = rows.get(cardKey);

    if (cardKey === gradedKey || row?.suspendedAt) {
      continue;
    }

    if (row && row.reviewCount > 0 && row.dueAt.getTime() >= buryUntil.getTime()) {
      continue;
    }

    if (row?.buriedUntil && row.buriedUntil.getTime() >= buryUntil.getTime()) {
      continue;
    }

    buried.push({
      cardKey,
      prevBuriedUntil: row?.buriedUntil?.toISOString() ?? null,
      buriedUntil: buryUntil.toISOString(),
      createdRow: !row,
    });
  }

  return buried;
}

export interface SiblingReleaseInput {
  sibling: KnowledgeBitBuriedSibling;
  row: SiblingBurialRow | null;
  reviewedSinceGrade: boolean;
}

export type SiblingReleaseOutcome =
  | { action: "leave" }
  | { action: "delete" }
  | { action: "restore"; buriedUntil: Date | null };

export function deriveSiblingRelease({
  sibling,
  row,
  reviewedSinceGrade,
}: SiblingReleaseInput): SiblingReleaseOutcome {
  if (
    !row ||
    reviewedSinceGrade ||
    row.buriedUntil?.getTime() !== new Date(sibling.buriedUntil).getTime()
  ) {
    return { action: "leave" };
  }

  if (sibling.createdRow && row.reviewCount === 0 && !row.suspendedAt && !sibling.prevBuriedUntil) {
    return { action: "delete" };
  }

  return {
    action: "restore",
    buriedUntil: sibling.prevBuriedUntil ? new Date(sibling.prevBuriedUntil) : null,
  };
}
