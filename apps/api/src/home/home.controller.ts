import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getHomeSummary } from "./home.service.js";

export async function handleGetHomeSummary(res: http.ServerResponse): Promise<void> {
  const summary = await getHomeSummary();

  sendJson(res, 200, summary);
}
