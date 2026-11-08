import { describe, expect, it, vi } from "vitest";
import { BUSINESS_DECK_TO_SUBJECT, resolveBusinessDeck, resolveDeckSubjectId } from "./business-deck-mapping.js";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));

function makeStore(rootId: string | null, childId: string | null) {
  return {
    findRootByName: vi.fn(async () => rootId),
    findChildByName: vi.fn(async () => childId),
  };
}

describe("business deck mapping", () => {
  it("should map every one of the seven Anki decks to its Business sub-subject", () => {
    expect(Object.keys(BUSINESS_DECK_TO_SUBJECT)).toHaveLength(7);

    for (const [deck, subject] of Object.entries(BUSINESS_DECK_TO_SUBJECT)) {
      expect(resolveBusinessDeck(deck)).toBe(subject);
    }

    expect(resolveBusinessDeck("Маркетинг воронка")).toBe("Marketing");
  });

  it("should accept a deck name in other case with stray spaces", () => {
    expect(resolveBusinessDeck("  ПРОДАЖИ ")).toBe("Sales");
  });

  it("should refuse an unknown deck without touching the store", async () => {
    const store = makeStore("root", "child");

    expect(await resolveDeckSubjectId("Cooking", store)).toEqual({ error: "unknown_deck" });
    expect(store.findRootByName).not.toHaveBeenCalled();
    expect(store.findChildByName).not.toHaveBeenCalled();
  });

  it("should resolve the existing sub-subject id for a known deck", async () => {
    const store = makeStore("root_1", "sub_marketing");

    expect(await resolveDeckSubjectId("Маркетинг и СММ", store)).toEqual({
      subjectId: "sub_marketing",
      subjectName: "Marketing",
    });
    expect(store.findChildByName).toHaveBeenCalledWith("root_1", "Marketing");
  });

  it("should report subject_missing when the Business root is absent", async () => {
    expect(await resolveDeckSubjectId("Продажи", makeStore(null, null))).toEqual({
      error: "subject_missing",
      subjectName: "Sales",
    });
  });

  it("should report subject_missing when the sub-subject is absent", async () => {
    expect(await resolveDeckSubjectId("Продажи", makeStore("root_1", null))).toEqual({
      error: "subject_missing",
      subjectName: "Sales",
    });
  });
});
