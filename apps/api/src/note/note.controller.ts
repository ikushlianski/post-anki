import type http from "node:http";
import { eq } from "drizzle-orm";
import {
  captureNoteInput,
  concernSchema,
  noteNodeTypeSchema,
  type Concern,
  type NoteNodeType,
} from "@post-anki/shared";
import { normalizeSearchQuery } from "@post-anki/core";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getDb } from "../db/client.js";
import { gaps, sources, topics } from "../db/schema.js";
import { insertNote, listNotesForNode } from "./note.repo.js";
import { searchNotes } from "./note-search.repo.js";

async function nodeExists(nodeType: NoteNodeType, nodeId: string): Promise<boolean> {
  const db = getDb();

  if (nodeType === "topic") {
    return (await db.select({ id: topics.id }).from(topics).where(eq(topics.id, nodeId))).length > 0;
  }

  if (nodeType === "gap") {
    return (await db.select({ id: gaps.id }).from(gaps).where(eq(gaps.id, nodeId))).length > 0;
  }

  return (await db.select({ id: sources.id }).from(sources).where(eq(sources.id, nodeId))).length > 0;
}

export async function handleCaptureNote(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, captureNoteInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const exists = await nodeExists(body.data.nodeType, body.data.nodeId);

  if (!exists) {
    sendError(res, 404, "not_found");
    return;
  }

  const note = await insertNote(body.data);

  sendJson(res, 201, note);
}

export async function handleListNotesForNode(
  res: http.ServerResponse,
  nodeTypeParam: string | null,
  nodeIdParam: string | null,
): Promise<void> {
  const parsedNodeType = noteNodeTypeSchema.safeParse(nodeTypeParam);

  if (!parsedNodeType.success || !nodeIdParam) {
    sendError(res, 400, "invalid_query", "nodeType and nodeId are both required");
    return;
  }

  const results = await listNotesForNode(parsedNodeType.data, nodeIdParam);

  sendJson(res, 200, results);
}

export async function handleSearchNotes(
  res: http.ServerResponse,
  queryParam: string | null,
  concernParam: string | null,
  domainNodeIdParam: string | null,
): Promise<void> {
  const normalized = normalizeSearchQuery(queryParam ?? "");

  if (normalized === null) {
    sendJson(res, 200, []);
    return;
  }

  let concern: Concern | undefined;

  if (concernParam) {
    const parsedConcern = concernSchema.safeParse(concernParam);

    if (!parsedConcern.success) {
      sendError(res, 400, "invalid_concern");
      return;
    }

    concern = parsedConcern.data;
  }

  const results = await searchNotes({
    query: normalized,
    concern,
    domainNodeId: domainNodeIdParam ?? undefined,
  });

  sendJson(res, 200, results);
}
