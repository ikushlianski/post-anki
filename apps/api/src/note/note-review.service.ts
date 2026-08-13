import type http from "node:http";
import { selectNoteForReview } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { listNotesForReviewPool, markNoteSurfaced } from "./note.repo.js";

function parseExcludeIds(excludeIdsParam: string | null): string[] {
  if (!excludeIdsParam) {
    return [];
  }

  return excludeIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export async function handleReviewNote(
  res: http.ServerResponse,
  excludeIdsParam: string | null,
): Promise<void> {
  const excludeIds = parseExcludeIds(excludeIdsParam);
  const pool = await listNotesForReviewPool();

  const candidates = pool.map((note) => ({
    id: note.id,
    lastSurfacedAt: note.lastSurfacedAt,
    createdAt: note.createdAt,
  }));

  const selectedId = selectNoteForReview(candidates, new Date().toISOString(), excludeIds);
  const selected = selectedId ? (pool.find((note) => note.id === selectedId) ?? null) : null;

  if (selected) {
    await markNoteSurfaced(selected.id, new Date());
  }

  sendJson(res, 200, { note: selected });
}
