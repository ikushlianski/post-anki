import type http from "node:http";
import type { DailyPushResponse } from "@post-anki/shared";
import { selectDailyPush } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { gatherPushCandidates } from "./push.repo.js";

export async function handleDailyPush(res: http.ServerResponse): Promise<void> {
  const candidates = await gatherPushCandidates();
  const pick = selectDailyPush(candidates, new Date().toISOString());

  const body: DailyPushResponse = { push: pick };

  sendJson(res, 200, body);
}
