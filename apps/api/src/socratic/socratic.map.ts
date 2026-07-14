import type { SocraticTurn } from "@post-anki/shared";
import type { SocraticTurnRow } from "./socratic.repo.js";

export function rowToTurn(row: SocraticTurnRow): SocraticTurn {
  return {
    id: row.id,
    gapId: row.gapId,
    conceptLabel: row.conceptLabel,
    prompt: row.prompt,
    order: row.order,
  };
}

export function countPriorWrong(
  turns: { gapId: string | null; degree: string | null }[],
  gapId: string | null,
): number {
  return turns.filter(
    (t) =>
      t.gapId === gapId &&
      (t.degree === "slightly_wrong" || t.degree === "mostly_wrong"),
  ).length;
}
