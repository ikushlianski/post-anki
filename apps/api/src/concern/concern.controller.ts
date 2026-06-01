import type http from "node:http";
import type { CrossCuttingResponse } from "@post-anki/shared";
import { summarizeConcerns } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { listGapsForConfirmedCurricula } from "../gap/gap.repo.js";

export async function handleCrossCutting(
  res: http.ServerResponse,
): Promise<void> {
  const gaps = await listGapsForConfirmedCurricula();
  const body: CrossCuttingResponse = { summaries: summarizeConcerns(gaps) };

  sendJson(res, 200, body);
}
