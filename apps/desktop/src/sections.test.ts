import { describe, expect, it } from "vitest";
import { sectionForKeyDown, SECTIONS } from "@/sections";

describe("sectionForKeyDown", () => {
  it("should open the matching section when Command and a number key are pressed", () => {
    expect(sectionForKeyDown({ key: "1", metaKey: true })).toBe("subjects");
    expect(sectionForKeyDown({ key: "3", metaKey: true })).toBe("review");
    expect(sectionForKeyDown({ key: "5", metaKey: true })).toBe("settings");
  });

  it("should list the five sections in sidebar order", () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      "subjects",
      "add-knowledge",
      "review",
      "triage",
      "settings",
    ]);
  });

  it("should open Add knowledge when Command-N is pressed in either letter case", () => {
    expect(sectionForKeyDown({ key: "n", metaKey: true })).toBe("add-knowledge");
    expect(sectionForKeyDown({ key: "N", metaKey: true })).toBe("add-knowledge");
  });

  it("should open Settings when Command-comma is pressed", () => {
    expect(sectionForKeyDown({ key: ",", metaKey: true })).toBe("settings");
  });

  it("should ignore number keys typed without Command so text entry keeps working", () => {
    expect(sectionForKeyDown({ key: "2", metaKey: false })).toBeNull();
  });

  it("should ignore Command with a key that has no section", () => {
    expect(sectionForKeyDown({ key: "6", metaKey: true })).toBeNull();
  });
});
