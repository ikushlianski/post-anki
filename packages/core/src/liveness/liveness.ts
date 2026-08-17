import type { NudgeResponse } from "@post-anki/shared";
import {
  LIVENESS_DAY_MS,
  LIVENESS_DECAY_HALF_LIFE_DAYS,
  LIVENESS_GENERATION_THRESHOLD,
  LIVENESS_STARTING_SCORE,
} from "./liveness-constants";
import { clampLivenessScore } from "./liveness-score";
import { applyNudgeResponse } from "./nudge";

export interface LivenessState {
  lastActivityAt: string | null;
  lastNudgeAt: string | null;
  lastNudgeResponse: NudgeResponse | null;
  baseScore: number | null;
}

export function computeLiveness(
  state: LivenessState,
  now: string,
): number | null {
  const { lastActivityAt, lastNudgeAt, lastNudgeResponse, baseScore } = state;

  const revivedAt = lastNudgeResponse === "yes" ? lastNudgeAt : null;
  const revivalIsAnchor =
    revivedAt !== null &&
    (lastActivityAt === null || millis(revivedAt) > millis(lastActivityAt));

  const anchorAt = revivalIsAnchor ? revivedAt : lastActivityAt;

  if (anchorAt === null) {
    return null;
  }

  const anchorScore = revivalIsAnchor
    ? applyNudgeResponse(baseScore ?? LIVENESS_STARTING_SCORE, "yes")
    : (baseScore ?? LIVENESS_STARTING_SCORE);

  const elapsedDays = (millis(now) - millis(anchorAt)) / LIVENESS_DAY_MS;

  if (elapsedDays <= 0) {
    return clampLivenessScore(anchorScore);
  }

  const decayed =
    anchorScore * Math.pow(0.5, elapsedDays / LIVENESS_DECAY_HALF_LIFE_DAYS);

  return clampLivenessScore(decayed);
}

export function allowsGeneration(liveness: number | null): boolean {
  if (liveness === null) {
    return true;
  }

  return liveness >= LIVENESS_GENERATION_THRESHOLD;
}

function millis(timestamp: string): number {
  return new Date(timestamp).getTime();
}
