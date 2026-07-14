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
