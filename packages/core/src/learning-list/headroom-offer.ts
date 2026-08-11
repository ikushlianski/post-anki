import type { DepthHeadroom } from "@post-anki/shared";
import type { MasteryStatus } from "../mastery/mastery-state";
import {
  GENERATION_DAY_MS,
  HEADROOM_OFFER_COOLDOWN_DAYS,
} from "./generation-constants";

export interface HeadroomOfferState {
  masteryAtElectedDepth: MasteryStatus;
  lastOfferAt: string | null;
  headroom: DepthHeadroom | null;
}

export function shouldOfferHeadroom(
  state: HeadroomOfferState,
  now: string,
): boolean {
  const { masteryAtElectedDepth, lastOfferAt, headroom } = state;

  if (headroom === null) {
    return false;
  }

  if (masteryAtElectedDepth !== "mastered") {
    return false;
  }

  if (lastOfferAt === null) {
    return true;
  }

  const elapsedDays =
    (new Date(now).getTime() - new Date(lastOfferAt).getTime()) / GENERATION_DAY_MS;

  return elapsedDays >= HEADROOM_OFFER_COOLDOWN_DAYS;
}
