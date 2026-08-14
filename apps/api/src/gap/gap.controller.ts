import type http from "node:http";
import {
  curateGapInput,
  declareGapInput,
  markGapResurfacedInput,
  triageGapInput,
  type DepthLevel,
  type Gap,
} from "@post-anki/shared";
import { eq } from "drizzle-orm";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getDb } from "../db/client.js";
import { gaps, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { rowToGap } from "./gap.repo.js";
import { listGapsDueForResurface, markGapResurfaced, triageGapLocked } from "./gap-triage.repo.js";

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
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
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

// POST /gaps/:id/triage (issue #29) — the one Telegram-tap write path
// (Important / Defer again / Dismiss). Locked via triageGapLocked so two
// concurrent taps on the same gap (duplicate webhook delivery) serialize
// into one real transition and one true no-op.
export async function handleTriageGap(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gapId: string,
): Promise<void> {
  const body = await readJsonBody(req, triageGapInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const now = new Date().toISOString();
  const result = await triageGapLocked(gapId, body.data.action, now);

  if (!result) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}

// GET /gaps/due-for-resurface — read-only candidate list for the
// gapResurfaceJob scheduled job / bot's POST /gap-resurface handler.
export async function handleDueForResurface(res: http.ServerResponse): Promise<void> {
  const now = new Date().toISOString();
  const result = await listGapsDueForResurface(now);

  sendJson(res, 200, result);
}

// POST /gaps/:id/mark-resurfaced — committed only after the bot's Telegram
// send for this gap has already succeeded (see server.ts's POST
// /gap-resurface in apps/bot). Never called eagerly.
export async function handleMarkResurfaced(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gapId: string,
): Promise<void> {
  const body = await readJsonBody(req, markGapResurfacedInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const now = new Date().toISOString();
  await markGapResurfaced(gapId, body.data.kind, now);

  sendJson(res, 200, { ok: true });
}
