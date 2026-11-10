import { beforeEach, describe, expect, it, vi } from "vitest";

const listActiveSubjectIds = vi.hoisted(() => vi.fn());
const listAlternates = vi.hoisted(() => vi.fn());
const getKnowledgeBitReviewQueue = vi.hoisted(() => vi.fn());

vi.mock("./knowledge-bit-review-pack.repo.js", () => ({ listActiveSubjectIds, listAlternates }));
vi.mock("./knowledge-bit-review-queue.repo.js", () => ({ getKnowledgeBitReviewQueue }));
vi.mock("../subject-study-options/subject-study-options-resolver.js", () => ({
  loadStudyOptionsResolver: vi.fn(async () => ({ resolvePlan: vi.fn() })),
}));
vi.mock("../study-plan/study-plan-today.js", () => ({
  readStudyPlanClock: vi.fn(async () => ({ today: "2026-11-10", timeZone: "UTC" })),
}));
vi.mock("./knowledge-bit-schedule-options.js", () => ({ toScheduleOptions: vi.fn() }));

import { buildReviewPack } from "./knowledge-bit-review-pack.service.js";

const NOW = new Date("2026-11-10T12:00:00.000Z");

function card(id: string, cardKey = "") {
  return { variantId: id, knowledgeBitId: `bit_${id}`, cardKey };
}

beforeEach(() => {
  listActiveSubjectIds.mockReset();
  listAlternates.mockReset();
  getKnowledgeBitReviewQueue.mockReset();
  listAlternates.mockResolvedValue(new Map());
});

describe("buildReviewPack", () => {
  it("should send an empty pack when nothing was studied in the last 3 days", async () => {
    listActiveSubjectIds.mockResolvedValue([]);

    const pack = await buildReviewPack("UTC", NOW);

    expect(pack.cards).toEqual([]);
    expect(pack.truncated).toBe(false);
    expect(getKnowledgeBitReviewQueue).not.toHaveBeenCalled();
  });

  it("should look back exactly 3 days to find the studied subjects", async () => {
    listActiveSubjectIds.mockResolvedValue([]);

    await buildReviewPack("UTC", NOW);

    expect(listActiveSubjectIds.mock.calls[0]![0]).toEqual(new Date("2026-11-07T12:00:00.000Z"));
  });

  it("should pack cards due within the next 24 hours for the studied subjects", async () => {
    listActiveSubjectIds.mockResolvedValue(["s1"]);
    getKnowledgeBitReviewQueue.mockResolvedValue({ cards: [card("a")] });

    const pack = await buildReviewPack("UTC", NOW);

    expect(getKnowledgeBitReviewQueue).toHaveBeenCalledWith(150, undefined, {
      tz: "UTC",
      now: NOW,
      pack: { subjectIds: ["s1"], dueCutoff: new Date("2026-11-11T12:00:00.000Z") },
    });
    expect(pack.dueBefore).toBe("2026-11-11T12:00:00.000Z");
    expect(pack.truncated).toBe(false);
  });

  it("should flag the pack as truncated when it hits the 150-card cap", async () => {
    listActiveSubjectIds.mockResolvedValue(["s1"]);
    getKnowledgeBitReviewQueue.mockResolvedValue({
      cards: Array.from({ length: 150 }, (_, index) => card(`c${index}`)),
    });

    expect((await buildReviewPack("UTC", NOW)).truncated).toBe(true);
  });

  it("should attach alternate wordings only to plain cards", async () => {
    listActiveSubjectIds.mockResolvedValue(["s1"]);
    getKnowledgeBitReviewQueue.mockResolvedValue({ cards: [card("a"), card("b", "gap1")] });
    listAlternates.mockResolvedValue(new Map([["bit_a", [{ variantId: "alt" }]], ["bit_b", [{ variantId: "x" }]]]));

    const pack = await buildReviewPack("UTC", NOW);

    expect(pack.cards[0]?.alternates).toEqual([{ variantId: "alt" }]);
    expect(pack.cards[1]?.alternates).toEqual([]);
  });
});
