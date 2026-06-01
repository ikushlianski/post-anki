import type http from "node:http";
import {
  curateGapInput,
  declareGapInput,
  type DepthLevel,
  type Gap,
} from "@post-anki/shared";
import { eq } from "drizzle-orm";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getDb } from "../db/client.js";
import { gaps, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { rowToGap } from "./gap.repo.js";

export async function handleDeclareGap(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, declareGapInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const db = getDb();
  const topic = (
    await db.select().from(topics).where(eq(topics.id, body.data.topicId))
  )[0];

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  const row = {
    id: newId("gap"),
    topicId: body.data.topicId,
    label: body.data.label,
    depth: (body.data.depth ?? (topic.depth as DepthLevel)) as string,
    origin: "user" as const,
    state: "open" as const,
    wanted: body.data.wanted ?? true,
    concern: body.data.concern ?? null,
  };

  await db.insert(gaps).values(row);

  const gap: Gap = {
    id: row.id,
    topicId: row.topicId,
    label: row.label,
    depth: row.depth as DepthLevel,
    origin: row.origin,
    state: row.state,
    wanted: row.wanted,
    concern: row.concern,
    lastEvaluatedAt: null,
  };

  sendJson(res, 201, gap);
}

export async function handleCurateGap(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gapId: string,
): Promise<void> {
  const body = await readJsonBody(req, curateGapInput.omit({ gapId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const db = getDb();
  const existing = (await db.select().from(gaps).where(eq(gaps.id, gapId)))[0];

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  const patch: Partial<typeof gaps.$inferInsert> = {};

  if (body.data.state !== undefined) {
    patch.state = body.data.state;
  }

  if (body.data.wanted !== undefined) {
    patch.wanted = body.data.wanted;
  }

  if (body.data.depth !== undefined) {
    patch.depth = body.data.depth;
  }

  if (body.data.concern !== undefined) {
    patch.concern = body.data.concern;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(gaps).set(patch).where(eq(gaps.id, gapId));
  }

  sendJson(res, 200, rowToGap({ ...existing, ...patch }));
}
