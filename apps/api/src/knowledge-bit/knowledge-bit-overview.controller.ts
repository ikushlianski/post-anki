import type http from "node:http";
import { knowledgeBitOverviewQuerySchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { listKnowledgeBitOverview } from "./knowledge-bit-overview.repo.js";

// GET /knowledge-bits/overview
export async function handleListKnowledgeBitOverview(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = knowledgeBitOverviewQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  sendJson(res, 200, await listKnowledgeBitOverview(parsed.data, new Date()));
}
