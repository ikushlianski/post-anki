import { describe, expect, it, vi } from "vitest";
import type { Subject } from "@post-anki/shared";

const state = vi.hoisted(() => ({
  subjects: [] as Subject[],
}));

vi.mock("../subject/subject.repo.js", () => ({
  listSubjects: vi.fn(async () => state.subjects),
}));

const { listDecks, LIST_DECKS_MAX_LIMIT } = await import("./list-decks.tool.js");

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "sub_1",
    name: "Spanish",
    description: undefined,
    requireSources: false,
    kind: "language-practice",
    modelTier: null,
    ...overrides,
  };
}

describe("listDecks", () => {
  it("returns only subjects whose kind is language-practice", async () => {
    state.subjects = [
      makeSubject({ id: "deck_1", name: "Spanish", kind: "language-practice" }),
      makeSubject({ id: "course_1", name: "Architecture", kind: "architecture-mentor" }),
      makeSubject({ id: "deck_2", name: "French", kind: "language-practice" }),
    ];

    const result = await listDecks({});

    expect(result.items.map((item) => item.id)).toEqual(["deck_1", "deck_2"]);
    expect(result.total).toBe(2);
  });

  it("maps a null/undefined description to null and keeps id/name", async () => {
    state.subjects = [
      makeSubject({ id: "deck_1", name: "Spanish", description: undefined }),
    ];

    const result = await listDecks({});

    expect(result.items[0]).toEqual({ id: "deck_1", name: "Spanish", description: null });
  });

  it("defaults to limit 50 and offset 0", async () => {
    state.subjects = Array.from({ length: 3 }, (_, i) =>
      makeSubject({ id: `deck_${i}`, name: `Deck ${i}` }),
    );

    const result = await listDecks({});

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    expect(result.items).toHaveLength(3);
  });

  it("clamps a limit above 200 to 200 instead of rejecting it", async () => {
    state.subjects = Array.from({ length: 5 }, (_, i) =>
      makeSubject({ id: `deck_${i}`, name: `Deck ${i}` }),
    );

    const result = await listDecks({ limit: 5000 });

    expect(result.limit).toBe(LIST_DECKS_MAX_LIMIT);
    expect(result.items).toHaveLength(5);
  });

  it("honours limit and offset for paging, with a correct total", async () => {
    state.subjects = Array.from({ length: 10 }, (_, i) =>
      makeSubject({ id: `deck_${i}`, name: `Deck ${i}` }),
    );

    const result = await listDecks({ limit: 3, offset: 4 });

    expect(result.items.map((item) => item.id)).toEqual(["deck_4", "deck_5", "deck_6"]);
    expect(result.total).toBe(10);
    expect(result.limit).toBe(3);
    expect(result.offset).toBe(4);
  });
});
