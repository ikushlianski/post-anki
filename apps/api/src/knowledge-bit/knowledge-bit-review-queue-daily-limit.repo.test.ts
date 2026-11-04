import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ total: 0, limit: 200 }));

vi.mock("./knowledge-bit-review.repo.js", () => ({
  getLocalDayWindow: async () => ({
    startsAt: new Date("2090-03-10T00:00:00.000Z"),
    endsAt: new Date("2090-03-11T00:00:00.000Z"),
  }),
}));

vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getMaxReviewsPerDay: async () => state.limit,
}));

const { isDailyLimitReached, readDailyReviewLimit } = await import(
  "./knowledge-bit-review-queue-daily-limit.repo.js"
);

const db = {
  select: () => ({ from: () => ({ where: async () => [{ total: state.total }] }) }),
} as never;
const clock = { tz: "UTC", now: new Date("2090-03-10T12:00:00.000Z") };

describe("daily review limit", () => {
  beforeEach(() => {
    state.total = 0;
    state.limit = 200;
  });

  it.each([
    [199, 200, false],
    [200, 200, true],
    [500, 0, false],
  ])("should report reviewed %s of limit %s as reached=%s", (reviewed, limit, reached) => {
    expect(isDailyLimitReached(reviewed, limit)).toBe(reached);
  });

  it("should tell the learner they are done once today's reviews hit the limit", async () => {
    state.total = 30;
    state.limit = 30;

    expect(await readDailyReviewLimit(clock, db)).toMatchObject({
      reviewedToday: 30,
      limit: 30,
      reached: true,
      dayEndsAt: new Date("2090-03-11T00:00:00.000Z"),
    });
  });

  it("should never stop a learner who set the limit to unlimited", async () => {
    state.total = 5000;
    state.limit = 0;

    expect((await readDailyReviewLimit(clock, db)).reached).toBe(false);
  });
});
