import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { sweepIdleTriageSessions } from "./card-triage-idle-sweep.orchestrator.js";

// POST /triage-sessions/idle-sweep (Cloud Scheduler, bearer-authorized in api-server)
export async function handleIdleTriageSweep(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await sweepIdleTriageSessions());
}
