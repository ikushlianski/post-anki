import { describe, expect, it, vi } from "vitest";
import type { CardSearchResult } from "../cards/card-search.repo.js";
import type { SearchCurriculumResult, SearchTopicResult } from "../search/search.repo.js";

const state = vi.hoisted(() => ({
  cardRows: [] as CardSearchResult[],
  courseRows: [] as SearchCurriculumResult[],
  topicRows: [] as SearchTopicResult[],
  capturedCardQuery: undefined as string | undefined,
  capturedCardLimit: undefined as number | undefined,
  capturedCourseQuery: undefined as string | undefined,
  capturedTopicQuery: undefined as string | undefined,
}));

vi.mock("../cards/card-search.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../cards/card-search.repo.js")>(
    "../cards/card-search.repo.js",
  );

  return {
    ...actual,
    searchCards: vi.fn(async (query: string, limit: number) => {
      state.capturedCardQuery = query;
      state.capturedCardLimit = limit;

      return state.cardRows;
    }),
  };
});

vi.mock("../search/search.repo.js", () => ({
  searchCurricula: vi.fn(async (query: string) => {
    state.capturedCourseQuery = query;

    return state.courseRows;
  }),
  searchTopics: vi.fn(async (query: string) => {
    state.capturedTopicQuery = query;

    return state.topicRows;
  }),
}));

const { searchKnowledgeItems } = await import("./search-knowledge-items.tool.js");

describe("searchKnowledgeItems", () => {
  it("merges card, course, and topic search results", async () => {
    state.cardRows = [
      {
        cardId: "card_1",
        topicId: "top_1",
        curriculumId: "cur_1",
        concept: "Closures",
        prompt: "What is a closure?",
        answer: "A bundled scope.",
      },
    ];
    state.courseRows = [{ id: "cur_1", name: "JavaScript" }];
    state.topicRows = [{ id: "top_1", title: "Closures", curriculumId: "cur_1" }];

    const result = await searchKnowledgeItems({ query: "closure" });

    expect(result).toEqual({
      cards: state.cardRows,
      courses: state.courseRows,
      topics: state.topicRows,
    });
  });

  it("defaults the card search limit and clamps an over-max limit", async () => {
    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];

    await searchKnowledgeItems({ query: "closure" });
    expect(state.capturedCardLimit).toBe(50);

    await searchKnowledgeItems({ query: "closure", limit: 5000 });
    expect(state.capturedCardLimit).toBe(200);
  });

  it("escapes % and _ before passing the query to the course and topic search, but not to card search", async () => {
    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];

    await searchKnowledgeItems({ query: "50%_off" });

    expect(state.capturedCourseQuery).toBe("50\\%\\_off");
    expect(state.capturedTopicQuery).toBe("50\\%\\_off");
    expect(state.capturedCardQuery).toBe("50%_off");
  });

  it("slices an oversized course/topic result down to the effective limit, in a stable name order", async () => {
    state.cardRows = [];
    state.courseRows = [
      { id: "cur_3", name: "Zebra course" },
      { id: "cur_1", name: "Alpha course" },
      { id: "cur_2", name: "Middle course" },
    ];
    state.topicRows = [
      { id: "top_3", title: "Zebra topic", curriculumId: "cur_3" },
      { id: "top_1", title: "Alpha topic", curriculumId: "cur_1" },
      { id: "top_2", title: "Middle topic", curriculumId: "cur_2" },
    ];

    const result = await searchKnowledgeItems({ query: "course", limit: 2 });

    expect(result.courses).toEqual([
      { id: "cur_1", name: "Alpha course" },
      { id: "cur_2", name: "Middle course" },
    ]);
    expect(result.topics).toEqual([
      { id: "top_1", title: "Alpha topic", curriculumId: "cur_1" },
      { id: "top_2", title: "Middle topic", curriculumId: "cur_2" },
    ]);
  });

  it("clamps an over-max limit to 200 for the course/topic result groups too, not just cards", async () => {
    state.cardRows = [];
    state.courseRows = Array.from({ length: 201 }, (_, i) => ({
      id: `cur_${String(i).padStart(3, "0")}`,
      name: `Course ${String(i).padStart(3, "0")}`,
    }));
    state.topicRows = Array.from({ length: 201 }, (_, i) => ({
      id: `top_${String(i).padStart(3, "0")}`,
      title: `Topic ${String(i).padStart(3, "0")}`,
      curriculumId: "cur_1",
    }));

    const result = await searchKnowledgeItems({ query: "course", limit: 5000 });

    expect(result.courses).toHaveLength(200);
    expect(result.topics).toHaveLength(200);
  });

  it("defaults the course/topic result groups to 50 when no limit is given", async () => {
    state.cardRows = [];
    state.courseRows = Array.from({ length: 60 }, (_, i) => ({
      id: `cur_${String(i).padStart(3, "0")}`,
      name: `Course ${String(i).padStart(3, "0")}`,
    }));
    state.topicRows = Array.from({ length: 60 }, (_, i) => ({
      id: `top_${String(i).padStart(3, "0")}`,
      title: `Topic ${String(i).padStart(3, "0")}`,
      curriculumId: "cur_1",
    }));

    const result = await searchKnowledgeItems({ query: "course" });

    expect(result.courses).toHaveLength(50);
    expect(result.topics).toHaveLength(50);
  });
});
