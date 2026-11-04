import { describe, expect, it } from "vitest";
import {
  deriveExamWindow,
  deriveNewCardPace,
  deriveNewCardPause,
  deriveRetentionMultiplier,
} from "./study-plan-derive";

const examWindow = (examDate: string, today: string, plannedOn: string | null = today) =>
  deriveExamWindow({ intent: "exam", examDate, plannedOn, today });

describe("deriveRetentionMultiplier", () => {
  it("should keep today's gaps at 90%", () => {
    expect(deriveRetentionMultiplier(0.9)).toBe(1);
  });

  it("should halve gaps at 95% and stop shortening above that", () => {
    expect(deriveRetentionMultiplier(0.95)).toBe(0.5);
    expect(deriveRetentionMultiplier(0.97)).toBe(0.5);
    expect(deriveRetentionMultiplier(0.99)).toBe(0.5);
  });

  it("should lengthen gaps by about half at 85% and stop lengthening below 80%", () => {
    expect(deriveRetentionMultiplier(0.85)).toBeCloseTo(1.54, 2);
    expect(deriveRetentionMultiplier(0.8)).toBeCloseTo(2, 0);
    expect(deriveRetentionMultiplier(0.7)).toBe(2);
  });
});

describe("deriveExamWindow", () => {
  it("should cap gaps at the day before the exam", () => {
    expect(examWindow("2026-12-01", "2026-11-11").maxIntervalDays).toBe(19);
  });

  it("should shrink the cap as the exam approaches", () => {
    expect(examWindow("2026-12-01", "2026-11-26").maxIntervalDays).toBe(4);
  });

  it("should never cap below one day", () => {
    expect(examWindow("2026-12-01", "2026-11-30").maxIntervalDays).toBe(1);
  });

  it("should behave as Long-term once the exam date has passed", () => {
    const window = examWindow("2026-12-01", "2026-12-02", "2026-11-01");

    expect(window.mode).toBe("long_term");
    expect(window.examPassed).toBe(true);
    expect(window.maxIntervalDays).toBe(365);
  });

  it("should keep the 365-day cap for Long-term", () => {
    const window = deriveExamWindow({ intent: "long_term", examDate: null, plannedOn: null, today: "2026-11-01" });

    expect(window.maxIntervalDays).toBe(365);
    expect(window.newCardsEndOn).toBeNull();
  });

  it("should cap long exams at 365 days", () => {
    expect(examWindow("2028-01-01", "2026-11-01").maxIntervalDays).toBe(365);
  });

  it("should put the new-material end three quarters of the way from planning to the exam", () => {
    expect(examWindow("2027-01-04", "2026-11-05").newCardsEndOn).toBe("2026-12-20");
  });

  it("should keep the new-material end one day before the exam at the latest", () => {
    expect(examWindow("2026-11-02", "2026-11-01").newCardsEndOn).toBe("2026-11-01");
  });
});

describe("deriveNewCardPace", () => {
  const window = examWindow("2027-01-04", "2026-11-05");
  const base = { window, explicitPerDay: null, fallbackPerDay: 20, remainingAtDayStart: 450, today: "2026-11-05" };

  it("should pace 450 new cards over 60 days at 10 a day", () => {
    expect(deriveNewCardPace(base)).toEqual({ perDay: 10, paced: true });
  });

  it("should keep today's number stable while new cards are learned", () => {
    const morning = deriveNewCardPace(base).perDay;
    const evening = deriveNewCardPace({ ...base, remainingAtDayStart: 450 }).perDay;

    expect(evening).toBe(morning);
  });

  it("should spread leftovers up to the day before the exam once past the three-quarter point", () => {
    const late = examWindow("2027-01-04", "2026-12-25", "2026-11-05");
    const pace = deriveNewCardPace({ ...base, window: late, today: "2026-12-25", remainingAtDayStart: 100 });

    expect(pace.perDay).toBe(Math.ceil(100 / 9));
  });

  it("should never exceed 200 a day", () => {
    expect(deriveNewCardPace({ ...base, remainingAtDayStart: 100000 }).perDay).toBe(200);
  });

  it("should use the typed number instead of the pace", () => {
    expect(deriveNewCardPace({ ...base, explicitPerDay: 3 })).toEqual({ perDay: 3, paced: false });
  });

  it("should serve nothing when no new cards remain", () => {
    expect(deriveNewCardPace({ ...base, remainingAtDayStart: 0 }).perDay).toBe(0);
  });

  it("should keep today's per-subject limit for Long-term", () => {
    const longTerm = deriveExamWindow({ intent: "long_term", examDate: null, plannedOn: null, today: "2026-11-05" });

    expect(deriveNewCardPace({ ...base, window: longTerm })).toEqual({ perDay: 20, paced: false });
  });
});

describe("deriveNewCardPause", () => {
  it("should pause new cards at 400 waiting reviews for 20 a day and resume at 399", () => {
    expect(deriveNewCardPause({ mode: "exam", waitingReviews: 400, perDay: 20 }).paused).toBe(true);
    expect(deriveNewCardPause({ mode: "exam", waitingReviews: 399, perDay: 20 }).paused).toBe(false);
  });

  it("should use at least 100 as the limit", () => {
    expect(deriveNewCardPause({ mode: "exam", waitingReviews: 100, perDay: 2 })).toEqual({
      paused: true,
      threshold: 100,
    });
  });

  it("should never pause Long-term subjects", () => {
    expect(deriveNewCardPause({ mode: "long_term", waitingReviews: 5000, perDay: 20 }).paused).toBe(false);
  });
});
