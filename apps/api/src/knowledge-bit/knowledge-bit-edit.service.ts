import type { EditKnowledgeBitInput } from "@post-anki/shared";
import { updateKnowledgeBitBody } from "./knowledge-bit.repo.js";
import { bitHasNoteCards } from "./knowledge-bit-note-cards.repo.js";

export type EditKnowledgeBitError = "not_found" | "wrong_shape";

export async function editKnowledgeBit(
  id: string,
  input: EditKnowledgeBitInput,
): Promise<{ ok: true } | { error: EditKnowledgeBitError }> {
  const updated = await updateKnowledgeBitBody(id, input.body, input.background);

  if (!updated) {
    return { error: (await bitHasNoteCards(id)) ? "wrong_shape" : "not_found" };
  }

  return { ok: true };
}
