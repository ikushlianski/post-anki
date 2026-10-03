import type { EditKnowledgeBitInput } from "@post-anki/shared";
import { updateKnowledgeBitBody } from "./knowledge-bit.repo.js";

export type EditKnowledgeBitError = "not_found";

export async function editKnowledgeBit(
  id: string,
  input: EditKnowledgeBitInput,
): Promise<{ ok: true } | { error: EditKnowledgeBitError }> {
  const updated = await updateKnowledgeBitBody(id, input.body, input.background);

  if (!updated) {
    return { error: "not_found" };
  }

  return { ok: true };
}
