import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { defaultNotionGateway } from "./default-notion-gateway.js";
import { getNotionSourceRow } from "./notion-ingestion-source.repo.js";
import { runDueNotionSources } from "./run-due-notion-sources.js";
import { runNotionSource } from "./run-notion-source.js";

export async function handleRunNotionSource(res: http.ServerResponse, id: string): Promise<void> {
  const source = await getNotionSourceRow(id);

  if (!source) {
    sendError(res, 404, "not_found");
    return;
  }

  const outcome = await runNotionSource(source, "manual", defaultNotionGateway());

  if (outcome.kind === "source_missing") {
    sendError(res, 404, "not_found");
    return;
  }

  if (outcome.kind === "already_running") {
    sendError(res, 409, "already_running");
    return;
  }

  sendJson(res, 200, outcome.result);
}

export async function handleRunDueNotionSources(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { runs: await runDueNotionSources(defaultNotionGateway()) });
}
