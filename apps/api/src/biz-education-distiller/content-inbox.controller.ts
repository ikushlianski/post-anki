import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { listContentInbox } from "./distiller.repo.js";
import { distillBizEducation } from "./distiller.orchestrator.js";

export async function handleListContentInbox(res: http.ServerResponse): Promise<void> {
  const rows = await listContentInbox();

  sendJson(res, 200, rows);
}

// A failure here is a real 502 — never a silent "nothing needed distilling".
export async function handleTriggerBizEducationDistill(res: http.ServerResponse): Promise<void> {
  try {
    const result = await distillBizEducation();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "biz_education_distill_failed");

    const message = err instanceof Error ? err.message : "biz education distill failed";

    sendError(res, 502, "scan_failed", message);
  }
}
