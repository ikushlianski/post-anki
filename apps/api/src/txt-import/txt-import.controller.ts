import type http from "node:http";
import { z } from "zod";
import { BodyTooLargeError, readJsonBody, sendError, sendJson } from "../shared/http.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { importIdSchema } from "../anki-import/anki-import.events.js";
import { stageImportNotes } from "../anki-import/anki-import.repo.js";
import { insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { kickSourcesAfterAdd } from "../knowledge-source/knowledge-source-kick.js";
import { findSubjectAssignmentError } from "../subject/subject-leaf.js";
import { TXT_IMPORT_MESSAGES } from "./txt-import.plan.js";
import { getTxtImportStatus } from "./txt-import-status.repo.js";
import { runTxtImport, type TxtImportDeps } from "./txt-import.service.js";

const inputSchema = z.object({
  text: z.string(),
  subjectId: z.string().min(1).nullable().optional(),
});

function defaultDeps(): TxtImportDeps {
  return {
    subjectExists: async (subjectId) => (await findSubjectAssignmentError(subjectId)) === null,
    stageNotes: (importId, rows) => stageImportNotes(importId, rows),
    insertSources: (items, subjectId) => insertKeyedKnowledgeSources(items, subjectId),
    kick: (sourceIds) => kickSourcesAfterAdd(sourceIds),
    sendImportEvent: async (importId) => {
      await createInngestClient().send({ name: "anki-import/requested", data: { importId } });
    },
  };
}

export async function handleCreateTxtImport(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: TxtImportDeps = defaultDeps(),
): Promise<void> {
  let body: Awaited<ReturnType<typeof readJsonBody<z.infer<typeof inputSchema>>>>;

  try {
    body = await readJsonBody(req, inputSchema);
  } catch (err) {
    if (!(err instanceof BodyTooLargeError)) throw err;

    sendError(res, 413, "file_too_large", TXT_IMPORT_MESSAGES.file_too_large);

    return;
  }

  if (!body.ok) {
    sendError(res, 400, "invalid_input", body.issues);

    return;
  }

  const result = await runTxtImport({ text: body.data.text, subjectId: body.data.subjectId ?? null }, deps);

  if (result.status === 200) {
    sendJson(res, 200, result.body);

    return;
  }

  sendError(res, result.status, result.body.error, result.body.message);
}

export async function handleGetTxtImportStatus(res: http.ServerResponse, importId: string): Promise<void> {
  const parsed = importIdSchema.safeParse(importId);

  if (!parsed.success) {
    sendError(res, 400, "invalid_input", "importId: invalid");

    return;
  }

  sendJson(res, 200, await getTxtImportStatus(parsed.data));
}
