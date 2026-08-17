import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getCoverageReport, getRetentionReport, getWeeklyDigest } from "./analytics.service.js";

export async function handleGetCoverageReport(res: http.ServerResponse): Promise<void> {
  const report = await getCoverageReport();

  sendJson(res, 200, report);
}

export async function handleGetRetentionReport(res: http.ServerResponse): Promise<void> {
  const report = await getRetentionReport();

  sendJson(res, 200, report);
}

export async function handleGetWeeklyDigest(res: http.ServerResponse): Promise<void> {
  const digest = await getWeeklyDigest();

  sendJson(res, 200, digest);
}
