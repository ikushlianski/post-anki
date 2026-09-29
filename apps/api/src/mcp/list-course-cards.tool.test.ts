import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardBrowserRow } from "@post-anki/shared";

const state = vi.hoisted(() => ({
  rows: [] as CardBrowserRow[],
  lastCurriculumId: undefined as string | undefined,
  curriculumExists: true,
}));

vi.mock("../cards/list-cards-for-curriculum.repo.js", () => ({
  listCardsForCurriculum: vi.fn(async (curriculumId: string) => {
    state.lastCurriculumId = curriculumId;

    return state.rows;
  }),
}));

vi.mock("../curriculum/curriculum-exists.repo.js", () => ({
  curriculumExists: vi.fn(async () => state.curriculumExists),
}));

const { listCourseCards, LIST_COURSE_CARDS_MAX_LIMIT } = await import("./list-course-cards.tool.js");

afterEach(() => {
  state.curriculumExists = true;
});

function makeRow(overrides: Partial<CardBrowserRow> = {}): CardBrowserRow {
  return {
    variantId: "var_1",
    cardId: "card_1",
    concept: "Concept",
    prompt: "Prompt",
    answer: "Answer",
    topicId: "top_1",
    topicTitle: "Topic A",
    ...overrides,
  };
}

describe("listCourseCards", () => {
  it("maps each row to the flattened cardId/topicId/topicTitle/concept/prompt/answer shape", async () => {
    state.rows = [makeRow()];

    const result = await listCourseCards({ curriculumId: "cur_1" });

    expect(result?.items).toEqual([
      {
        cardId: "card_1",
        topicId: "top_1",
        topicTitle: "Topic A",
        concept: "Concept",
        prompt: "Prompt",
        answer: "Answer",
      },
    ]);
    expect(result?.total).toBe(1);
  });

  it("passes curriculumId through to the repo read", async () => {
    state.rows = [];

    await listCourseCards({ curriculumId: "cur_42" });

    expect(state.lastCurriculumId).toBe("cur_42");
  });

  it("defaults to limit 50 and offset 0", async () => {
    state.rows = [makeRow()];

    const result = await listCourseCards({ curriculumId: "cur_1" });

    expect(result?.limit).toBe(50);
    expect(result?.offset).toBe(0);
  });

  it("clamps a limit above 200 to 200 instead of rejecting it, truncating the actual page too", async () => {
    state.rows = Array.from({ length: 201 }, (_, i) => makeRow({ cardId: `card_${i}` }));

    const result = await listCourseCards({ curriculumId: "cur_1", limit: 5000 });

    expect(result?.limit).toBe(LIST_COURSE_CARDS_MAX_LIMIT);
    expect(result?.items).toHaveLength(200);
    expect(result?.total).toBe(201);
  });

  it("honours limit and offset for paging, with a correct total reflecting all ready cards", async () => {
    state.rows = Array.from({ length: 10 }, (_, i) => makeRow({ cardId: `card_${i}` }));

    const result = await listCourseCards({ curriculumId: "cur_1", limit: 3, offset: 4 });

    expect(result?.items.map((item) => item.cardId)).toEqual(["card_4", "card_5", "card_6"]);
    expect(result?.total).toBe(10);
  });

  it("returns null for an unknown curriculumId, without reading any cards", async () => {
    state.curriculumExists = false;
    state.rows = [makeRow()];
    state.lastCurriculumId = undefined;

    const result = await listCourseCards({ curriculumId: "cur_missing" });

    expect(result).toBeNull();
    expect(state.lastCurriculumId).toBeUndefined();
  });
});
