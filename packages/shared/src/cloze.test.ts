import { describe, expect, it } from "vitest";
import {
  buildClozeCards,
  parseCloze,
  renderClozeBack,
  stripClozeMarkers,
  type ParsedCloze,
} from "./cloze";

function parsed(text: string): ParsedCloze {
  const result = parseCloze(text);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.note;
}

describe("cloze notes", () => {
  const sales = "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::need}}.";

  it("should make exactly one card per gap number, each hiding only its own gap", () => {
    const cards = buildClozeCards(parsed(sales));

    expect(cards.map((card) => card.prompt)).toEqual([
      "A deal needs ____, authority and need.",
      "A deal needs budget, ____ and need.",
      "A deal needs budget, authority and ____.",
    ]);
    expect(cards.map((card) => card.answer)).toEqual(["budget", "authority", "need"]);
  });

  it("should hide both gaps of a repeated number on one card", () => {
    const cards = buildClozeCards(parsed("{{c1::Cash}} in, {{c1::cash}} out, {{c2::profit}} left"));

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ prompt: "____ in, ____ out, profit left", answer: "Cash / cash" });
  });

  it("should accept non-consecutive numbers and uppercase markers", () => {
    const cards = buildClozeCards(parsed("{{C1::a}} and {{c3::b}}"));

    expect(cards.map((card) => card.n)).toEqual([1, 3]);
  });

  it("should show the hint next to the blank only on the front", () => {
    const note = parsed("The capital is {{c1::Paris::city in France}}.");
    const [card] = buildClozeCards(note);

    expect(card?.prompt).toBe("The capital is ____ (hint: city in France).");
    expect(card?.answer).toBe("Paris");
    expect(renderClozeBack(card?.prompt ?? "", card?.answer ?? "")).toEqual([
      { text: "The capital is ", bold: false },
      { text: "Paris", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("should treat an empty hint as no hint", () => {
    expect(buildClozeCards(parsed("x {{c1::a::}} y"))[0]?.prompt).toBe("x ____ y");
  });

  it("should keep the readable statement without markers", () => {
    expect(stripClozeMarkers(parsed(sales))).toBe("A deal needs budget, authority and need.");
  });

  it.each([
    ["{{c1::}} is empty", "empty_gap"],
    ["{{c1:: }} is blank", "empty_gap"],
    ["{{c1::a {{c2::b}}}}", "nested"],
    ["{{c1::open", "unclosed"],
    ["no gaps here", "no_gaps"],
    [`{{c1::${"x".repeat(121)}}}`, "gap_too_long"],
    [Array.from({ length: 11 }, (_, i) => `{{c${i + 1}::a}}`).join(" "), "too_many_gaps"],
  ])("should refuse %j with %s", (text, error) => {
    expect(parseCloze(text)).toEqual({ ok: false, error });
  });

  it("should not fill the back when the answer count does not match the blanks", () => {
    expect(renderClozeBack("a ____ b ____", "one")).toBeNull();
  });
});
