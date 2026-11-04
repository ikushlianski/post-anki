import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeSubjectsFailure, loadSubjects } from "./load-subjects.js";

type FakeOption = { value: string; textContent: string };
type FakeSelect = {
  options: FakeOption[];
  value: string;
  replaceChildren: (...items: FakeOption[]) => void;
  append: (item: FakeOption) => void;
};

function createFakeSelect(): FakeSelect {
  const select: FakeSelect = {
    options: [],
    value: "",
    replaceChildren: (...items) => {
      select.options = [...items];
    },
    append: (item) => {
      select.options.push(item);
    },
  };

  return select;
}

function view() {
  const select = createFakeSelect();
  const note = { textContent: "" };

  return { select, note, asView: { select, note } as unknown as Parameters<typeof loadSubjects>[0] };
}

describe("loadSubjects", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ value: "", textContent: "" }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should fetch from the given address and token and keep the chosen subject when the new list has it", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true as const,
      subjects: [
        { id: "s1", name: "Biology" },
        { id: "s2", name: "History" },
      ],
    }));
    const { select, note, asView } = view();

    note.textContent = "stale failure";
    await loadSubjects(asView, "https://api.example.com", "tok", "s2", fetcher);

    expect(fetcher).toHaveBeenCalledWith("https://api.example.com", "tok");
    expect(select.options.map((option) => option.value)).toEqual(["", "s1", "s2"]);
    expect(select.value).toBe("s2");
    expect(note.textContent).toBe("");
  });

  it("should fall back to No subject when the chosen subject is not on the new server", async () => {
    const { select, asView } = view();

    await loadSubjects(asView, "https://api.example.com", "", "gone", async () => ({ ok: true as const, subjects: [{ id: "s1", name: "Biology" }] }));

    expect(select.value).toBe("");
  });

  it.each([
    [{ ok: false as const, reason: "unauthorized" as const }, "Token rejected (401)"],
    [{ ok: false as const, reason: "forbidden" as const }, "set EXTENSION_ID in the API env"],
    [{ ok: false as const, reason: "network" as const }, "API not reachable at https://bad.example.com"],
    [{ ok: false as const, reason: "other" as const, status: 502 }, "API error (502)"],
  ])("should show a distinct note and only No subject for %j", async (failure, expected) => {
    const { select, note, asView } = view();

    await loadSubjects(asView, "https://bad.example.com", "tok", "s1", async () => failure);

    expect(select.options.map((option) => option.value)).toEqual([""]);
    expect(note.textContent).toContain(expected);
  });

  it("should say no token is set, not rejected, when the token is empty", async () => {
    const { note, asView } = view();

    await loadSubjects(asView, "https://x.example", "", undefined, async () => ({ ok: false as const, reason: "unauthorized" as const }));

    expect(note.textContent).toContain("No token set");
    expect(note.textContent).not.toContain("rejected");
  });

  it("should mark the token field invalid when a given token is rejected and clear it once subjects load", async () => {
    const attributes = new Set<string>();
    const tokenInput = {
      setAttribute: (name: string) => attributes.add(name),
      removeAttribute: (name: string) => attributes.delete(name),
    };
    const { note, select } = view();
    const withToken = { select, note, tokenInput } as unknown as Parameters<typeof loadSubjects>[0];

    await loadSubjects(withToken, "u", "bad", undefined, async () => ({ ok: false as const, reason: "unauthorized" as const }));

    expect(attributes.has("aria-invalid")).toBe(true);
    expect(note.textContent).toContain("Token rejected");

    await loadSubjects(withToken, "u", "good", undefined, async () => ({ ok: true as const, subjects: [] }));

    expect(attributes.has("aria-invalid")).toBe(false);
  });

  it("should word each failure differently", () => {
    const notes = [
      describeSubjectsFailure({ reason: "unauthorized" }, "u"),
      describeSubjectsFailure({ reason: "forbidden" }, "u"),
      describeSubjectsFailure({ reason: "network" }, "u"),
      describeSubjectsFailure({ reason: "other", status: 500 }, "u"),
    ];

    expect(new Set(notes).size).toBe(4);
  });
});
