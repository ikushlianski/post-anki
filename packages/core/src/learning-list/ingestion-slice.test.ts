import { describe, it, expect } from "vitest";
import { ingestionSliceSchema } from "@post-anki/shared";
import {
  LIVENESS_GENERATION_THRESHOLD,
  LIVENESS_MAX_SCORE,
  LIVENESS_MIN_SCORE,
  LIVENESS_NUDGE_THRESHOLD,
} from "../liveness/liveness-constants";
import { GENERATION_DAY_MS, SLICE_QUESTION_COUNT, SLICE_TOPIC_COUNT } from "./generation-constants";
import { nextIngestionSlice, type NextIngestionSliceInput } from "./ingestion-slice";
import { planQuestionCeiling } from "./question-ceiling";

const SERIES_CEILING = planQuestionCeiling("series", 9);
const NOW = "2026-08-08T00:00:00.000Z";

function slice(overrides: Partial<NextIngestionSliceInput>) {
  const input: NextIngestionSliceInput = {
    liveness: LIVENESS_GENERATION_THRESHOLD,
    questionsAlreadyGenerated: 0,
    ceiling: SERIES_CEILING,
    lastReleasedAt: null,
    unansweredCount: 1,
    ...overrides,
  };

  return nextIngestionSlice(input, NOW);
}

describe("nextIngestionSlice", () => {
  describe("on approval of a mini-course", () => {
    it("releases one module of about three topics instead of the whole ceiling", () => {
      expect(slice({})).toEqual({
        topicCount: SLICE_TOPIC_COUNT,
        questionCount: SLICE_QUESTION_COUNT,
      });
    });

    it("generates far less than the ceiling on the first slice", () => {
      expect(slice({})?.questionCount).toBeLessThan(SERIES_CEILING);
    });
  });

  describe("when liveness has never been established", () => {
    it("lets a pre-existing curriculum with no liveness history keep generating, because unset is not dead", () => {
      expect(slice({ liveness: null })).toEqual({
        topicCount: SLICE_TOPIC_COUNT,
        questionCount: SLICE_QUESTION_COUNT,
      });
    });

    it("still stops an unset item at its ceiling", () => {
      expect(slice({ liveness: null, questionsAlreadyGenerated: SERIES_CEILING })).toBeNull();
    });
  });

  describe("while the user keeps answering, on a fresh day each time", () => {
    it("keeps releasing the next slice up to the ceiling", () => {
      expect(
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: 12,
          lastReleasedAt: "2026-08-06T00:00:00.000Z",
        }),
      ).toEqual({ topicCount: SLICE_TOPIC_COUNT, questionCount: SLICE_QUESTION_COUNT });
    });

    it("shrinks the last slice so the ceiling is never overshot", () => {
      expect(
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: SERIES_CEILING - 3,
          lastReleasedAt: "2026-08-06T00:00:00.000Z",
        }),
      ).toEqual({ topicCount: 2, questionCount: 3 });
    });

    it("stops generating at the ceiling even when liveness stays at its maximum", () => {
      expect(
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: SERIES_CEILING,
          lastReleasedAt: "2026-08-06T00:00:00.000Z",
        }),
      ).toBeNull();
    });

    it("never resumes once more questions exist than the ceiling allows", () => {
      expect(
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: SERIES_CEILING + 10,
          lastReleasedAt: "2026-08-06T00:00:00.000Z",
        }),
      ).toBeNull();
    });

    it("caps total generation at the ceiling across a whole run of slices spread over separate days", () => {
      let generated = 0;
      let slices = 0;
      let lastReleasedAt: string | null = null;
      let clock = new Date(NOW).getTime();

      while (slices < 100) {
        const result = nextIngestionSlice(
          {
            liveness: LIVENESS_MAX_SCORE,
            questionsAlreadyGenerated: generated,
            ceiling: SERIES_CEILING,
            lastReleasedAt,
            unansweredCount: 1,
          },
          new Date(clock).toISOString(),
        );

        if (result === null) {
          break;
        }

        generated += result.questionCount;
        lastReleasedAt = new Date(clock).toISOString();
        clock += GENERATION_DAY_MS;
        slices += 1;
      }

      expect(generated).toBe(SERIES_CEILING);
    });
  });

  describe("pacing — at most one slice release per entity per day", () => {
    it("allows the very first release, when no prior release exists", () => {
      expect(slice({ lastReleasedAt: null })).not.toBeNull();
    });

    it("blocks a second release the same day a first one already fired", () => {
      const lastReleasedAt = new Date(new Date(NOW).getTime() - 60 * 60 * 1000).toISOString();

      expect(slice({ questionsAlreadyGenerated: 6, lastReleasedAt })).toBeNull();
    });

    it("blocks a release exactly at the boundary, just under GENERATION_DAY_MS", () => {
      const lastReleasedAt = new Date(
        new Date(NOW).getTime() - (GENERATION_DAY_MS - 1),
      ).toISOString();

      expect(slice({ questionsAlreadyGenerated: 6, lastReleasedAt })).toBeNull();
    });

    it("allows a release once a full GENERATION_DAY_MS has elapsed", () => {
      const lastReleasedAt = new Date(new Date(NOW).getTime() - GENERATION_DAY_MS).toISOString();

      expect(slice({ questionsAlreadyGenerated: 6, lastReleasedAt })).not.toBeNull();
    });

    it("means a burst of same-day answers can never unlock more than one slice", () => {
      const firstReleaseAt = NOW;

      const secondAttempt = nextIngestionSlice(
        {
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: SLICE_QUESTION_COUNT,
          ceiling: SERIES_CEILING,
          lastReleasedAt: firstReleaseAt,
          unansweredCount: 1,
        },
        new Date(new Date(firstReleaseAt).getTime() + 5 * 60 * 1000).toISOString(),
      );

      expect(secondAttempt).toBeNull();
    });
  });

  describe("an engaged learner who has answered everything currently released", () => {
    it("releases the next slice immediately, mid-pacing-window, once unansweredCount hits zero", () => {
      const lastReleasedAt = new Date(new Date(NOW).getTime() - 60 * 60 * 1000).toISOString();

      expect(
        slice({ questionsAlreadyGenerated: 6, lastReleasedAt, unansweredCount: 0 }),
      ).not.toBeNull();
    });

    it("still keeps pacing while any unanswered released content remains", () => {
      const lastReleasedAt = new Date(new Date(NOW).getTime() - 60 * 60 * 1000).toISOString();

      expect(
        slice({ questionsAlreadyGenerated: 6, lastReleasedAt, unansweredCount: 1 }),
      ).toBeNull();
    });

    it("does not let exhaustion override the liveness gate — a dead item still gets nothing", () => {
      expect(
        slice({
          liveness: LIVENESS_MIN_SCORE,
          questionsAlreadyGenerated: 6,
          lastReleasedAt: NOW,
          unansweredCount: 0,
        }),
      ).toBeNull();
    });

    it("does not let exhaustion override the question ceiling — a maxed-out item still gets nothing", () => {
      expect(
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: SERIES_CEILING,
          lastReleasedAt: NOW,
          unansweredCount: 0,
        }),
      ).toBeNull();
    });
  });

  describe("once the item has gone quiet", () => {
    it("stops releasing slices below the generation threshold", () => {
      expect(slice({ liveness: LIVENESS_NUDGE_THRESHOLD })).toBeNull();
      expect(slice({ liveness: LIVENESS_MIN_SCORE })).toBeNull();
    });

    it("resumes from the un-ingested remainder rather than from the beginning once revived", () => {
      const lastReleasedAt = "2026-08-06T00:00:00.000Z";
      const result = slice({ questionsAlreadyGenerated: 18, lastReleasedAt });

      expect(result).toEqual({ topicCount: 3, questionCount: 6 });
      expect(18 + (result?.questionCount ?? 0)).toBeLessThanOrEqual(SERIES_CEILING);
    });
  });

  describe("the shape handed to the generation orchestrator", () => {
    it("is always a releasable slice, down to the single question left under the ceiling", () => {
      const sizes = [0, SERIES_CEILING - 6, SERIES_CEILING - 1].map((generated) =>
        slice({
          liveness: LIVENESS_MAX_SCORE,
          questionsAlreadyGenerated: generated,
          lastReleasedAt: generated === 0 ? null : "2026-08-06T00:00:00.000Z",
        }),
      );

      for (const result of sizes) {
        expect(ingestionSliceSchema.safeParse(result).success).toBe(true);
      }
    });
  });

  describe("a single article folded into an Area", () => {
    it("is generated once and then never again", () => {
      const ceiling = planQuestionCeiling("single", 1);
      const first = slice({ liveness: null, ceiling, lastReleasedAt: null });

      expect(first?.questionCount).toBe(ceiling);
      expect(
        slice({
          liveness: null,
          ceiling,
          questionsAlreadyGenerated: first?.questionCount ?? 0,
          lastReleasedAt: NOW,
        }),
      ).toBeNull();
    });
  });
});
