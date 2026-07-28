import type http from "node:http";
import type { CrossCuttingNudgeResponse } from "@post-anki/shared";
import { detectCrossCuttingGaps } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { listMasteryTrackedGapsAcrossSubjects } from "./gap-mastery.repo.js";

// Generalized recall-gap mastery tracking (issue #57, SCENARIO 7) — a
// read-only, on-demand computed view (like concerns.tsx's
// summarizeConcerns rollup): no new persistence table for "nudges shown",
// no queue/badge, matches the "silent on non-response"/no-nagging
// principle. Deliberately a DISTINCT endpoint from the existing
// /cross-cutting (concern.controller.ts) — that one aggregates by
// `Concern` tag on ANY gap; this one aggregates by normalized label across
// MASTERY-TRACKED gaps only (Decision 7), a structurally different concept.
export async function handleGapMasteryCrossCuttingNudge(
  res: http.ServerResponse,
): Promise<void> {
  const gaps = await listMasteryTrackedGapsAcrossSubjects();

  const nudges = detectCrossCuttingGaps(
    gaps.map((g) => ({
      label: g.label,
      subjectId: g.subjectId,
      subjectName: g.subjectName,
      hasMasteryTracking: true,
      trackedStatus: g.status,
    })),
  );

  const body: CrossCuttingNudgeResponse = { nudges };

  sendJson(res, 200, body);
}
