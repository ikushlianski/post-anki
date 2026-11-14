import type http from "node:http";
import { z } from "zod";
import { CLOZE_ERROR_MESSAGES, createKnowledgeItemInput, parseCloze, stripClozeMarkers } from "@post-anki/shared";
import { findDuplicateCards } from "../knowledge-bit/knowledge-bit-duplicate-finder.js";
import { insertManualKnowledgeItem } from "../knowledge-bit/knowledge-bit-manual-item.repo.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { startKnowledgeBitPipelineKick } from "../knowledge-bit/pipeline-kick.starter.js";

const createItemRequest = createKnowledgeItemInput.and(z.object({ allowDuplicate: z.boolean().optional() }));

const ERROR_STATUS = { not_found: 404, already_running: 409, entry_processed: 409, duplicate_card: 409 } as const;

function duplicateDraft(item: z.infer<typeof createKnowledgeItemInput>) {
  if ("note" in item) {
    const parsed = parseCloze(item.note);

    return parsed.ok ? { front: stripClozeMarkers(parsed.note), back: "" } : null;
  }

  return { front: item.front, back: item.back };
}

export async function handleCreateKnowledgeSourceItem(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, createItemRequest);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const { allowDuplicate = false, ...item } = body.data;

  if (!allowDuplicate) {
    const draft = duplicateDraft(item);
    const check = draft ? await findDuplicateCards(draft) : null;

    if (check && check.matches.length > 0) {
      sendJson(res, 409, { error: "possible_duplicates", ...check });
      return;
    }
  }

  const result = await insertManualKnowledgeItem(id, item, undefined, allowDuplicate);

  if (!result.ok && result.error === "invalid_cloze") {
    sendJson(res, 400, { error: "invalid_cloze", message: CLOZE_ERROR_MESSAGES[result.reason] });
    return;
  }

  if (!result.ok) {
    sendError(res, ERROR_STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 201, result.item);

  try {
    await startKnowledgeBitPipelineKick();
  } catch (err) {
    log.error({ err }, "knowledge_bit_pipeline_kick_failed");
  }
}
