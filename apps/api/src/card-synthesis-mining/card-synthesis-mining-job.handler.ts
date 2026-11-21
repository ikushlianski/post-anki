import type http from "node:http";
import { z } from "zod";
import { sendError, sendInvalidQuery, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { runCardSynthesisMining } from "./card-synthesis-mining-job.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  dryRun: z.enum(["1", "true"]).optional(),
});

export async function handleCardSynthesisMining(res: http.ServerResponse, url: URL): Promise<void> {
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  try {
    const summary = await runCardSynthesisMining({
      limit: query.data.limit,
      dryRun: query.data.dryRun !== undefined,
    });

    sendJson(res, 200, summary);
  } catch (err) {
    log.error({ err }, "card_synthesis_mining_failed");
    sendError(res, 502, "card_synthesis_mining_failed", "The mining run failed. Check the server logs.");
  }
}
