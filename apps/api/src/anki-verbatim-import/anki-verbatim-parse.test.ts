import { describe, expect, it } from "vitest";
import { cleanField, parseVerbatimExport } from "./anki-verbatim-parse.js";

const HEADER = "#separator:tab\n#html:true\n#tags column:4\n";

describe("cleanField", () => {
  it("should turn entities and line breaks into plain text", () => {
    expect(cleanField("stave it off&nbsp;/&nbsp;fend<br>off")).toBe("stave it off / fend\noff");
  });

  it("should strip styling tags and keep the words", () => {
    expect(cleanField('<b>on</b> the <span style="font-weight: normal;">border</span>')).toBe("on the border");
  });
});

describe("parseVerbatimExport", () => {
  it("should keep front, back and example exactly as three fields", () => {
    const text = `${HEADER}Портить\tmar\tHis appearance was marred by a scar.\t\n`;

    expect(parseVerbatimExport(text).cards).toEqual([
      { front: "Портить", back: "mar", example: "His appearance was marred by a scar." },
    ]);
  });

  it("should read a quoted field with doubled quotes and an inner tab as one field", () => {
    const text = `${HEADER}взаимная торговля\t"mutual trade /&nbsp;<span style="" font-style: normal;"">reciprocal trade</span>"\t\t\n"Dear Sir:\tСэр!"\tmy back\t\n`;
    const { cards } = parseVerbatimExport(text);

    expect(cards[0]).toEqual({ front: "взаимная торговля", back: "mutual trade / reciprocal trade", example: null });
    expect(cards[1]?.front).toBe("Dear Sir: Сэр!");
    expect(cards[1]?.back).toBe("my back");
  });

  it("should skip rows with an empty front or back and count them", () => {
    const text = `${HEADER}\tback only\t\t\nfront only\t\t\t\n\ngood\tcard\t\t\n`;
    const result = parseVerbatimExport(text);

    expect(result.cards).toHaveLength(1);
    expect(result.skippedEmpty).toBe(3);
  });

  it("should drop exact duplicates inside the file, ignoring case and punctuation", () => {
    const text = `${HEADER}чиновник\turzędnik\t\t\nЧиновник\tUrzędnik.\t\t\nчиновник\tofficial\t\t\n`;
    const result = parseVerbatimExport(text);

    expect(result.cards.map((card) => card.back)).toEqual(["urzędnik", "official"]);
    expect(result.duplicates).toBe(1);
  });

  it("should not rewrite or translate any text", () => {
    const text = `${HEADER}иметь прибыльность\tboast profitability\t\t\n`;

    expect(parseVerbatimExport(text).cards[0]).toEqual({
      front: "иметь прибыльность",
      back: "boast profitability",
      example: null,
    });
  });
});
