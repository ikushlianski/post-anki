import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { evaluateAndAwardMilestones, listMilestones } from "./milestone.repo.js";

// GET /milestones — the ONLY place evaluateAndAwardMilestones is ever
// called from (Scenario 5). Achieving 100% on a curriculum or Area does not
// itself write anything; a write only happens as a side effect of this read,
// which fires only when Ilya opens the milestones page himself — no cron, no
// scheduler, no answer-submission code path reaches this function.
export async function handleGetMilestones(res: http.ServerResponse): Promise<void> {
  await evaluateAndAwardMilestones();

  const list = await listMilestones();

  sendJson(res, 200, list);
}
