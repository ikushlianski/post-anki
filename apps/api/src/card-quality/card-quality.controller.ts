import type http from "node:http";
import { cardQualityQuery } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { getCardQualityByModel } from "./card-quality.orchestrator.js";

// GET /card-quality/models
export async function handleGetCardQualityByModel(res: http.ServerResponse, search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const parsed = cardQualityQuery.safeParse(params.has("days") ? { days: params.get("days") } : {});

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues.map((issue) => issue.message).join("; ") });

    return;
  }

  sendJson(res, 200, await getCardQualityByModel(parsed.data.days));
}
