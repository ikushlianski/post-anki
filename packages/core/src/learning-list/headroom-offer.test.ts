import { describe, it, expect } from "vitest";
import { deriveDepthHeadroom } from "./depth-headroom";
import { HEADROOM_OFFER_COOLDOWN_DAYS } from "./generation-constants";
import { shouldOfferHeadroom, type HeadroomOfferState } from "./headroom-offer";

const NOW = "2026-08-07T00:00:00.000Z";

const basicsWithAdvancedLeft = deriveDepthHeadroom("working", "deep");

function daysAgo(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function offerState(overrides: Partial<HeadroomOfferState> = {}): HeadroomOfferState {
  return {
    masteryAtElectedDepth: "mastered",
    lastOfferAt: null,
    headroom: basicsWithAdvancedLeft,
    ...overrides,
  };
}

describe("shouldOfferHeadroom", () => {
  describe("a topic mastered at the depth it was elected for", () => {
    it("is offered the advanced level it has not studied yet", () => {
      expect(shouldOfferHeadroom(offerState(), NOW)).toBe(true);
    });
  });

  describe("a topic still being worked through", () => {
    it("is left alone while the elected depth is only being practised", () => {
      expect(shouldOfferHeadroom(offerState({ masteryAtElectedDepth: "practicing" }), NOW)).toBe(
        false,
      );
    });

    it("is never asked to go deeper while it is still being struggled with", () => {
      expect(shouldOfferHeadroom(offerState({ masteryAtElectedDepth: "struggling" }), NOW)).toBe(
        false,
      );
    });

    it("is never asked to go deeper before it has been studied at all", () => {
      expect(shouldOfferHeadroom(offerState({ masteryAtElectedDepth: "new" }), NOW)).toBe(false);
    });
  });

  describe("a topic with nothing left above its elected depth", () => {
    it("is never offered an upgrade it cannot take", () => {
      expect(shouldOfferHeadroom(offerState({ headroom: null }), NOW)).toBe(false);
    });

    it("is not offered an upgrade even when it is fully mastered", () => {
      expect(
        shouldOfferHeadroom(
          offerState({ headroom: deriveDepthHeadroom("deep", "deep") }),
          NOW,
        ),
      ).toBe(false);
    });
  });

  describe("after the offer has already been made once", () => {
    it("does not ask again the next day", () => {
      expect(shouldOfferHeadroom(offerState({ lastOfferAt: daysAgo(1) }), NOW)).toBe(false);
    });

    it("stays quiet through the whole cooling-off period", () => {
      expect(
        shouldOfferHeadroom(
          offerState({ lastOfferAt: daysAgo(HEADROOM_OFFER_COOLDOWN_DAYS - 1) }),
          NOW,
        ),
      ).toBe(false);
    });

    it("asks once more after the cooling-off period has elapsed", () => {
      expect(
        shouldOfferHeadroom(
          offerState({ lastOfferAt: daysAgo(HEADROOM_OFFER_COOLDOWN_DAYS) }),
          NOW,
        ),
      ).toBe(true);
    });

    it("cools off for far longer than a daily prompt would", () => {
      expect(HEADROOM_OFFER_COOLDOWN_DAYS).toBeGreaterThan(7);
    });
  });
});
