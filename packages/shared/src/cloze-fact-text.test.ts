import { describe, expect, it } from "vitest";
import { hasClozeMarkup, importedFactText } from "./cloze-fact-text";

describe("importedFactText", () => {
  it("should read a cloze note as a plain sentence with the gaps filled in", () => {
    expect(importedFactText("A deal needs {{c1::budget}} and {{c2::authority::who}}.")).toBe(
      "A deal needs budget and authority.",
    );
  });

  it("should fill a gap whose answer spans a newline", () => {
    expect(importedFactText("A deal needs {{c1::clear\nbudget}}.")).toBe("A deal needs clear\nbudget.");
  });

  it("should drop the Back Extra label and keep its text as plain prose", () => {
    expect(importedFactText("The {{c1::heart}} pumps blood.\n\nBack Extra: it has four chambers.")).toBe(
      "The heart pumps blood.\n\nit has four chambers.",
    );
  });

  it("should collapse runs of blank lines left behind by the note", () => {
    expect(importedFactText("A {{c1::b}}.\n\n\n\nNext.")).toBe("A b.\n\nNext.");
  });

  it("should leave plain text untouched", () => {
    const prose = "HTTP is a stateless protocol.\n\nSecond line.";

    expect(importedFactText(prose)).toBe(prose);
  });

  it("should leave a malformed marker readable instead of guessing its answer", () => {
    expect(importedFactText("A {{c1::b and c.")).toBe("A {{c1::b and c.");
  });
});

describe("hasClozeMarkup", () => {
  it("should detect a numbered gap marker", () => {
    expect(hasClozeMarkup("Paris is in {{c1::France}}.")).toBe(true);
  });

  it("should not flag plain prose or a double brace without a gap number", () => {
    expect(hasClozeMarkup("HTTP is stateless.")).toBe(false);
    expect(hasClozeMarkup("{{note}}")).toBe(false);
  });
});
