import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADD_KNOWLEDGE_DRAFT_KEY, readDraft, writeDraft } from "@/add-knowledge-draft";

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("add knowledge draft", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should restore the unsent text and subject after a restart", () => {
    writeDraft({ text: "Mitochondria make ATP", subjectId: "subj-1" });

    expect(readDraft()).toEqual({ text: "Mitochondria make ATP", subjectId: "subj-1" });
  });

  it("should start empty when nothing was saved", () => {
    expect(readDraft()).toEqual({ text: "", subjectId: "" });
  });

  it("should ignore a stored value that is not a draft", () => {
    storage.setItem(ADD_KNOWLEDGE_DRAFT_KEY, JSON.stringify({ text: 5 }));

    expect(readDraft()).toEqual({ text: "", subjectId: "" });
  });

  it("should forget the draft when there is nothing left to keep", () => {
    writeDraft({ text: "Mitochondria make ATP", subjectId: "" });
    writeDraft({ text: "   ", subjectId: "" });

    expect(storage.getItem(ADD_KNOWLEDGE_DRAFT_KEY)).toBeNull();
  });
});
