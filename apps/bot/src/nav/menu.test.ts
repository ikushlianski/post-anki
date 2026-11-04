import { describe, expect, it } from "vitest";
import type { Subject } from "@post-anki/shared";
import { emptySubjectsText, subjectButtonsOf } from "./menu.js";

function subject(id: string, name: string, parentId: string | null): Subject {
  return { id, name, parentId } as Subject;
}

describe("subjectButtonsOf", () => {
  it("should label nested subjects with their full path in tree order and keep the subject id in the callback", () => {
    const buttons = subjectButtonsOf([
      subject("c", "Cold sales", "s"),
      subject("x", "Common", null),
      subject("b", "Business", null),
      subject("s", "Sales", "b"),
    ]);

    expect(buttons.map((button) => button.text)).toEqual([
      "Business",
      "Business / Sales",
      "Business / Sales / Cold sales",
      "Common",
    ]);
    expect(buttons[2]?.callback_data).toContain("c");
  });
});

describe("emptySubjectsText", () => {
  it("should tell a new user to add a note in the app first and link the app when known", () => {
    expect(emptySubjectsText("https://app.example.com")).toBe(
      "No subjects yet. Add a note in the app first, then come back here.\nhttps://app.example.com",
    );
  });

  it("should still tell the user to add a note when no app link is configured", () => {
    expect(emptySubjectsText()).toBe("No subjects yet. Add a note in the app first, then come back here.");
  });
});
