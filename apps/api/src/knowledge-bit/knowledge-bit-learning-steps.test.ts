import { describe, expect, it } from "vitest";
import { deriveLearningStep } from "./knowledge-bit-learning-steps.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const secondsFromNow = (date: Date): number => (date.getTime() - NOW.getTime()) / 1000;
const DAY = 86_400;

describe("deriveLearningStep", () => {
  it("should bring a new card back in a minute after Again and keep it learning", () => {
    const next = deriveLearningStep({ phase: "new", learningStep: 0, intervalDays: 0 }, "again", NOW);

    expect(next).toMatchObject({ phase: "learning", learningStep: 0, intervalDays: 0 });
    expect(secondsFromNow(next.dueAt)).toBe(60);
  });

  it("should show a new card again in 5.5 minutes after Hard on the first step", () => {
    const next = deriveLearningStep({ phase: "new", learningStep: 0, intervalDays: 0 }, "hard", NOW);

    expect(next.learningStep).toBe(0);
    expect(secondsFromNow(next.dueAt)).toBe(330);
  });

  it("should move a new card to the 10-minute step after Good", () => {
    const next = deriveLearningStep({ phase: "learning", learningStep: 0, intervalDays: 0 }, "good", NOW);

    expect(next).toMatchObject({ phase: "learning", learningStep: 1 });
    expect(secondsFromNow(next.dueAt)).toBe(600);
  });

  it("should graduate a new card to four days after Easy", () => {
    const next = deriveLearningStep({ phase: "new", learningStep: 0, intervalDays: 0 }, "easy", NOW);

    expect(next).toMatchObject({ phase: "review", intervalDays: 4 });
    expect(secondsFromNow(next.dueAt)).toBe(4 * DAY);
  });

  it("should repeat the last step after Hard and restart at step 0 after Again", () => {
    const state = { phase: "learning", learningStep: 1, intervalDays: 0 } as const;

    expect(secondsFromNow(deriveLearningStep(state, "hard", NOW).dueAt)).toBe(600);
    expect(deriveLearningStep(state, "again", NOW).learningStep).toBe(0);
  });

  it("should graduate to one day after Good on the last step", () => {
    const next = deriveLearningStep({ phase: "learning", learningStep: 1, intervalDays: 0 }, "good", NOW);

    expect(next).toMatchObject({ phase: "review", intervalDays: 1 });
    expect(secondsFromNow(next.dueAt)).toBe(DAY);
  });

  it("should treat a step past the list as the last step", () => {
    const next = deriveLearningStep({ phase: "learning", learningStep: 9, intervalDays: 0 }, "good", NOW);

    expect(next.phase).toBe("review");
  });

  it("should keep a relearning card in its 10-minute step on Again and 15 minutes on Hard", () => {
    const state = { phase: "relearning", learningStep: 0, intervalDays: 1 } as const;

    expect(secondsFromNow(deriveLearningStep(state, "again", NOW).dueAt)).toBe(600);

    const hard = deriveLearningStep(state, "hard", NOW);

    expect(hard).toMatchObject({ phase: "relearning", intervalDays: 1 });
    expect(secondsFromNow(hard.dueAt)).toBe(900);
  });

  it("should return a relearning card to review at its interval on Good and one day more on Easy", () => {
    const state = { phase: "relearning", learningStep: 0, intervalDays: 1 } as const;

    expect(deriveLearningStep(state, "good", NOW)).toMatchObject({ phase: "review", intervalDays: 1 });
    expect(deriveLearningStep(state, "easy", NOW)).toMatchObject({ phase: "review", intervalDays: 2 });
  });
});
