import type http from "node:http";
import { listCardStyleNotesQuery, updateCardStyleNoteInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { listActiveStyleNotes, listAllActiveStyleNotes, updateCardStyleNote } from "./card-style-note.repo.js";

// GET /card-style-notes?subjectId=
export async function handleListCardStyleNotes(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = listCardStyleNotesQuery.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  const { subjectId } = parsed.data;

  sendJson(res, 200, {
    notes: subjectId ? await listActiveStyleNotes(subjectId) : await listAllActiveStyleNotes(),
  });
}

// PATCH /card-style-notes/:id
export async function handleUpdateCardStyleNote(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, updateCardStyleNoteInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const note = await updateCardStyleNote(id, body.data);

  if (!note) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, note);
}
