import { afterEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@post-anki/shared";
import { listPhrasesForSubject, type PhraseSelectRow } from "../practice/practice.repo.js";

const state = vi.hoisted(() => ({
  subjectById: new Map<string, Subject>(),
  phrasesBySubjectId: new Map<string, PhraseSelectRow[]>(),
}));

vi.mock("../subject/subject.repo.js", () => ({
  getSubject: vi.fn(async (subjectId: string) => state.subjectById.get(subjectId) ?? null),
}));

vi.mock("../practice/practice.repo.js", () => ({
  listPhrasesForSubject: vi.fn(
    async (subjectId: string) => state.phrasesBySubjectId.get(subjectId) ?? [],
  ),
}));

const { getDeckItems, GET_DECK_ITEMS_MAX_LIMIT } = await import("./get-deck-items.tool.js");

afterEach(() => {
  vi.clearAllMocks();
});

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "sub_1",
    name: "Spanish",
    description: undefined,
    requireSources: false,
    kind: "language-practice",
    modelTier: null,
  parentId: null,
    ...overrides,
  };
}

function makePhraseRow(overrides: Partial<PhraseSelectRow> = {}): PhraseSelectRow {
  return {
    id: "phrase_1",
    subjectId: "sub_1",
    batchId: "batch_1",
    level: "B1_B2",
    pack: "General",
    position: 1,
    russian: "привет",
    referenceEnglish: "hello",
    domain: "greetings",
    targetPhraseBankEntryId: null,
    sequenceNumber: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("getDeckItems", () => {
  it("returns a deck's phrase items mapped to id/russian/referenceEnglish/domain/createdAt", async () => {
    state.subjectById.set("sub_1", makeSubject());
    state.phrasesBySubjectId.set("sub_1", [
      makePhraseRow({ id: "phrase_1", sequenceNumber: 1 }),
      makePhraseRow({ id: "phrase_2", sequenceNumber: 2, russian: "спасибо", referenceEnglish: "thanks" }),
    ]);

    const result = await getDeckItems({ subjectId: "sub_1" });

    expect(result).toEqual({
      items: [
        {
          id: "phrase_1",
          russian: "привет",
          referenceEnglish: "hello",
          domain: "greetings",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "phrase_2",
          russian: "спасибо",
          referenceEnglish: "thanks",
          domain: "greetings",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
  });

  it("returns a not_found error tag for an unknown subject id, without listing phrases", async () => {
    const result = await getDeckItems({ subjectId: "sub_missing" });

    expect(result).toEqual({ error: "not_found" });
    expect(vi.mocked(listPhrasesForSubject)).not.toHaveBeenCalled();
  });

  it("returns a not_a_deck error tag when the subject exists but isn't language-practice", async () => {
    state.subjectById.set("sub_course", makeSubject({ id: "sub_course", kind: "architecture-mentor" }));
    state.phrasesBySubjectId.set("sub_course", [makePhraseRow({ subjectId: "sub_course" })]);

    const result = await getDeckItems({ subjectId: "sub_course" });

    expect(result).toEqual({ error: "not_a_deck" });
    expect(vi.mocked(listPhrasesForSubject)).not.toHaveBeenCalled();
  });

  it("honours limit and offset for paging, with a correct total", async () => {
    state.subjectById.set("sub_1", makeSubject());
    state.phrasesBySubjectId.set(
      "sub_1",
      Array.from({ length: 10 }, (_, i) => makePhraseRow({ id: `phrase_${i}`, sequenceNumber: i })),
    );

    const result = await getDeckItems({ subjectId: "sub_1", limit: 3, offset: 4 });

    expect(result).toMatchObject({ total: 10, limit: 3, offset: 4 });

    if (!("error" in result)) {
      expect(result.items.map((item) => item.id)).toEqual(["phrase_4", "phrase_5", "phrase_6"]);
    }
  });

  it("clamps a limit above 200 to 200 instead of rejecting it, truncating the actual page too", async () => {
    state.subjectById.set("sub_1", makeSubject());
    state.phrasesBySubjectId.set(
      "sub_1",
      Array.from({ length: 201 }, (_, i) => makePhraseRow({ id: `phrase_${i}`, sequenceNumber: i })),
    );

    const result = await getDeckItems({ subjectId: "sub_1", limit: 5000 });

    expect(result).toMatchObject({ limit: GET_DECK_ITEMS_MAX_LIMIT, total: 201 });

    if (!("error" in result)) {
      expect(result.items).toHaveLength(200);
    }
  });
});
