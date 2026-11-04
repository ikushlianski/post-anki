import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderSubjectOptions } from "./render-subject-options.js";

type FakeOption = { value: string; textContent: string; innerHTML: string };
type FakeSelect = {
  options: FakeOption[];
  value: string;
  replaceChildren: (...items: FakeOption[]) => void;
  append: (item: FakeOption) => void;
};

function createFakeOption(): FakeOption {
  const option = { value: "", textContent: "" } as FakeOption;

  Object.defineProperty(option, "innerHTML", {
    set() {
      throw new Error("innerHTML must not be used");
    },
  });

  return option;
}

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

function render(subjects: { id: string; name: string; parentId?: string }[], selectedId: string | undefined): FakeSelect {
  const select = createFakeSelect();

  renderSubjectOptions(select as unknown as HTMLSelectElement, subjects, selectedId);

  return select;
}

describe("renderSubjectOptions", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: createFakeOption });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should always offer a No subject choice with an empty value", () => {
    const select = render([], undefined);

    expect(select.options).toEqual([expect.objectContaining({ value: "", textContent: "No subject" })]);
    expect(select.value).toBe("");
  });

  it("should show a markup-looking subject name as plain text", () => {
    const name = "<img src=x onerror=alert(1)>";
    const select = render([{ id: "s1", name }], undefined);

    expect(select.options[1]).toMatchObject({ value: "s1", textContent: name });
  });

  it("should restore the saved subject as the selected one", () => {
    const select = render(
      [
        { id: "s1", name: "One" },
        { id: "s2", name: "Two" },
      ],
      "s2",
    );

    expect(select.value).toBe("s2");
  });

  it("should fall back to No subject when the saved subject no longer exists", () => {
    const select = render([{ id: "s1", name: "One" }], "gone");

    expect(select.value).toBe("");
  });

  it("should order options by tree and label same-named children with their parent path", () => {
    const select = render(
      [
        { id: "c2", name: "Common", parentId: "sales" },
        { id: "c1", name: "Common", parentId: "hr" },
        { id: "sales", name: "Sales", parentId: "biz" },
        { id: "hr", name: "HR", parentId: "biz" },
        { id: "biz", name: "Business" },
      ],
      undefined,
    );

    expect(select.options.slice(1).map((option) => [option.value, option.textContent])).toEqual([
      ["biz", "Business"],
      ["hr", "Business › HR"],
      ["c1", "Business › HR › Common"],
      ["sales", "Business › Sales"],
      ["c2", "Business › Sales › Common"],
    ]);
  });
});
