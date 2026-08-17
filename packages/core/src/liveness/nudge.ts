import type { NudgeResponse } from "@post-anki/shared";
import {
  LIVENESS_DAY_MS,
  LIVENESS_MIN_SCORE,
  LIVENESS_NUDGE_COOLDOWN_DAYS,
  LIVENESS_NUDGE_THRESHOLD,
  LIVENESS_REVIVAL_FLOOR,
} from "./liveness-constants";
import { clampLivenessScore } from "./liveness-score";

export function applyNudgeResponse(
  currentScore: number,
  response: NudgeResponse,
): number {
  if (response === "no") {
    return LIVENESS_MIN_SCORE;
  }

  return clampLivenessScore(Math.max(currentScore, LIVENESS_REVIVAL_FLOOR));
}

export function shouldNudge(
  liveness: number | null,
  lastNudgeAt: string | null,
  now: string,
): boolean {
  if (liveness === null) {
    return false;
  }

  if (liveness > LIVENESS_NUDGE_THRESHOLD) {
    return false;
  }

  if (lastNudgeAt === null) {
    return true;
  }

  const elapsedDays =
    (new Date(now).getTime() - new Date(lastNudgeAt).getTime()) / LIVENESS_DAY_MS;

  return elapsedDays >= LIVENESS_NUDGE_COOLDOWN_DAYS;
}

export function isDormant(lastNudgeResponse: NudgeResponse | null): boolean {
  return lastNudgeResponse === "no";
}
