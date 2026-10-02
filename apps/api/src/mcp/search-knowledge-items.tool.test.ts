import { describe, expect, it, vi } from "vitest";
import type { TopicModuleSearchResult } from "@post-anki/shared";
import type { CardSearchResult } from "../cards/card-search.repo.js";
import type { SearchCurriculumResult, SearchTopicResult } from "../search/search.repo.js";

const state = vi.hoisted(() => ({
  cardRows: [] as CardSearchResult[],
  courseRows: [] as SearchCurriculumResult[],
  topicRows: [] as SearchTopicResult[],
  rankedTopicModuleRows: [] as TopicModuleSearchResult[],
  bitRows: [] as TopicModuleSearchResult[],
  tagNodeRows: [] as TopicModuleSearchResult[],
  capturedCardQuery: undefined as string | undefined,
  capturedCardLimit: undefined as number | undefined,
  capturedCourseQuery: undefined as string | undefined,
  capturedTopicQuery: undefined as string | undefined,
  capturedRankedQuery: undefined as string | undefined,
  capturedBitQuery: undefined as string | undefined,
  capturedTagQuery: undefined as string | undefined,
  cardSearchDelayMs: 0,
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

      if (state.cardSearchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.cardSearchDelayMs));
      }

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
  searchTopicsAndModulesRanked: vi.fn(async (query: string) => {
    state.capturedRankedQuery = query;

    return state.rankedTopicModuleRows;
  }),
}));

vi.mock("../search/search-tag-and-bit.repo.js", () => ({
  searchKnowledgeBitsRanked: vi.fn(async (query: string) => {
    state.capturedBitQuery = query;

    return state.bitRows;
  }),
  searchByTagNameAcrossNodes: vi.fn(async (query: string) => {
    state.capturedTagQuery = query;

    return state.tagNodeRows;
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
      rankedTopics: [],
      modules: [],
      knowledgeBits: [],
    });
  });

  it("groups a ranked topic/module/bit match into its own result array, by kind", async () => {
    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];
    state.rankedTopicModuleRows = [
      {
        id: "top_r1",
        kind: "topic",
        title: "Event loop",
        curriculumId: "cur_r1",
        curriculumName: "Node internals",
        rank: 0.5,
        tags: [],
      },
      {
        id: "mod_r1",
        kind: "module",
        title: "Async primitives",
        curriculumId: "cur_r1",
        curriculumName: "Node internals",
        rank: 0.4,
        tags: [],
      },
    ];
    state.bitRows = [
      {
        id: "bit_r1",
        kind: "bit",
        title: "A microtask runs before the next macrotask",
        curriculumId: null,
        curriculumName: null,
        rank: 0.3,
        tags: [],
      },
    ];
    state.tagNodeRows = [];

    const result = await searchKnowledgeItems({ query: "event loop" });

    expect(result.rankedTopics).toEqual([state.rankedTopicModuleRows[0]]);
    expect(result.modules).toEqual([state.rankedTopicModuleRows[1]]);
    expect(result.knowledgeBits).toEqual(state.bitRows);
  });

  it("dedupes the same topic/module/bit found by both the title search and a tag-name match, keeping the higher rank", async () => {
    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];
    state.rankedTopicModuleRows = [
      { id: "top_dup", kind: "topic", title: "Retry budgets", curriculumId: null, curriculumName: null, rank: 0.2, tags: [] },
    ];
    state.bitRows = [];
    state.tagNodeRows = [
      { id: "top_dup", kind: "topic", title: "Retry budgets", curriculumId: null, curriculumName: null, rank: 1, tags: ["reliability"] },
    ];

    const result = await searchKnowledgeItems({ query: "retry" });

    expect(result.rankedTopics).toHaveLength(1);
    expect(result.rankedTopics[0]).toEqual(state.tagNodeRows[0]);
  });

  it("clamps the ranked topic/module/bit result groups to the effective limit too", async () => {
    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];
    state.rankedTopicModuleRows = Array.from({ length: 5 }, (_, i) => ({
      id: `top_${i}`,
      kind: "topic" as const,
      title: `Topic ${i}`,
      curriculumId: null,
      curriculumName: null,
      rank: i,
      tags: [],
    }));
    state.bitRows = [];
    state.tagNodeRows = [];

    const result = await searchKnowledgeItems({ query: "topic", limit: 2 });

    expect(result.rankedTopics).toHaveLength(2);
  });

  it("skips the ranked topic/module/bit search for a whitespace-only query, without breaking the existing card/course/topic search", async () => {
    state.cardRows = [
      {
        cardId: "card_ws",
        topicId: "top_ws",
        curriculumId: "cur_ws",
        concept: "Whitespace",
        prompt: "p",
        answer: "a",
      },
    ];
    state.courseRows = [];
    state.topicRows = [];

    const result = await searchKnowledgeItems({ query: "  " });

    expect(result.cards).toEqual(state.cardRows);
    expect(result.rankedTopics).toEqual([]);
    expect(result.modules).toEqual([]);
    expect(result.knowledgeBits).toEqual([]);
  });

  it("rejects (not crashes the process) when the ranked search fails while the card search is still pending", async () => {
    const { searchKnowledgeBitsRanked } = await import("../search/search-tag-and-bit.repo.js");

    state.cardRows = [];
    state.courseRows = [];
    state.topicRows = [];
    state.cardSearchDelayMs = 20;
    vi.mocked(searchKnowledgeBitsRanked).mockRejectedValueOnce(new Error("ranked search failed"));

    await expect(searchKnowledgeItems({ query: "closure" })).rejects.toThrow("ranked search failed");

    state.cardSearchDelayMs = 0;
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
    expect(state.capturedRankedQuery).toBe("50%_off");
    expect(state.capturedBitQuery).toBe("50%_off");
    expect(state.capturedTagQuery).toBe("50\\%\\_off");
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
