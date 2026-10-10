import type http from "node:http";
import { suspendedCardsQuerySchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { listSuspendedKnowledgeBits } from "./knowledge-bit-suspended.repo.js";

// GET /knowledge-bits/suspended
export async function handleListSuspendedKnowledgeBits(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = suspendedCardsQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  const page = await listSuspendedKnowledgeBits(parsed.data, new Date());

  sendJson(res, 200, page);
}
