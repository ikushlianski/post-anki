import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getRejectReasonsStatistics } from "./reject-reasons-statistics.service.js";

export async function handleGetRejectReasonsStatistics(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await getRejectReasonsStatistics());
}
