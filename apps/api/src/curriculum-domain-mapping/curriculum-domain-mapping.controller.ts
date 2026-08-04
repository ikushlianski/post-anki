import type http from "node:http";
import { resolveCurriculumDomainMappingInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { listMappingsForCurriculum, resolveMapping } from "./curriculum-domain-mapping.repo.js";
import { triggerCurriculumDomainMapping } from "./curriculum-domain-mapping.orchestrator.js";

// POST /curricula/:id/domain-mappings — SCENARIOS 1, 6, 11. A curriculum
// under a subject with no static taxonomy gets a clean 400 (checked before
// any agent call); a real agent failure gets a 502 with nothing inserted,
// mirroring handleTriggerDomainPriorityReview's own posture.
export async function handleTriggerCurriculumDomainMapping(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  try {
    const result = await triggerCurriculumDomainMapping(curriculumId);

    if ("error" in result) {
      if (result.error === "curriculum_not_found") {
        sendError(res, 404, "not_found");
        return;
      }

      sendError(res, 400, result.error);
      return;
    }

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_domain_mapping_failed");

    const message = err instanceof Error ? err.message : "curriculum domain mapping failed";

    sendError(res, 502, "mapping_failed", message);
  }
}

// GET /curricula/:id/domain-mappings
export async function handleListCurriculumDomainMappings(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  sendJson(res, 200, await listMappingsForCurriculum(curriculumId));
}

// PATCH /curriculum-domain-mappings/:id — accept (with an optional depth
// override, SCENARIO 4) or reject a suggested mapping. A mapping that is no
// longer 'suggested' is a 409, not a 404 — the row is there and already
// handled (SCENARIO 12), same distinction
// handleResolveDomainTopicSuggestion already makes for its own table.
export async function handleResolveCurriculumDomainMapping(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  mappingId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveCurriculumDomainMappingInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolveMapping(mappingId, {
    status: body.data.status,
    depth: body.data.depth,
  });

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    sendError(res, 409, "already_resolved");
    return;
  }

  sendJson(res, 200, result);
}
