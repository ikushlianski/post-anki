import { dispatchBackgroundJob } from "../background-job/background-job.starter.js";
import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";
import { generateKnowledgeBitVariants } from "./knowledge-bit-generate-variants.orchestrator.js";

// POST /knowledge-bits/:bitId/variants
export async function handleGenerateKnowledgeBitVariants(
  res: http.ServerResponse,
  bitId: string,
): Promise<void> {
  const bit = await getKnowledgeBitById(bitId);

  if (!bit) {
    sendError(res, 404, "not_found");
    return;
  }

  await dispatchBackgroundJob(
    { kind: "knowledge-bit-variants", bitId },
    () => generateKnowledgeBitVariants(bitId),
    (err) => log.error({ err, bitId }, "knowledge_bit_generate_variants_failed"),
  );

  sendJson(res, 202, { ok: true });
}
