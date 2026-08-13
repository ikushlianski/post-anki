import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { listLibrarySources } from "./content-library.repo.js";
import { refetchSource } from "./content-library.service.js";

// GET /sources
export async function handleListLibrarySources(res: http.ServerResponse): Promise<void> {
  const librarySources = await listLibrarySources();

  sendJson(res, 200, librarySources);
}

// POST /sources/:id/refetch
export async function handleRefetchSource(
  res: http.ServerResponse,
  sourceId: string,
): Promise<void> {
  const result = await refetchSource(sourceId);

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    sendJson(res, 400, {
      error: "not_refetchable",
      message: "only link sources with a fetchable URL can be re-fetched",
    });
    return;
  }

  sendJson(res, 200, result);
}
