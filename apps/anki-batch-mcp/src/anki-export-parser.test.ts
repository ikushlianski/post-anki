import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnkiExport } from "./anki-export-parser.js";

const text = readFileSync(new URL("./test-fixtures/small-export.txt", import.meta.url), "utf8");
const parsed = parseAnkiExport(text);
const [plain, answered, multiline, clozeSame, clozeExtra, entities, occlusion] = parsed.notes;

describe("parseAnkiExport", () => {
  it("should skip the header lines and read every record", () => {
    expect(parsed.headerLines).toEqual(["#separator:tab", "#html:true"]);
    expect(parsed.notes).toHaveLength(7);
  });

  it("should give a question with an empty answer an empty back", () => {
    expect(plain).toMatchObject({ front: "Что такое выручка", back: "", rawText: "Что такое выручка" });
  });

  it("should join question and answer into raw text", () => {
    expect(answered?.rawText).toBe("Что такое лид\n\nЧеловек, проявивший интерес");
  });

  it("should read a multi-line quoted field with escaped quotes as one record", () => {
    expect(multiline?.front).toBe('Что значит "маржа"\nв бизнесе');
    expect(multiline?.back).toBe('Первая строка\nВторая "строка"');
  });

  it("should take the deck from the label with or without the Business prefix", () => {
    expect(plain?.deck).toBe("Основы");
    expect(multiline?.deck).toBe("Финансы и планирование");
  });

  it("should take the deck from the hidden div and leave an occlusion note empty", () => {
    expect(occlusion).toMatchObject({ deck: "Маркетинг воронка", front: "", back: "", rawText: "", isCloze: false });
  });

  it("should drop a cloze back that repeats the restored sentence", () => {
    expect(clozeSame).toMatchObject({ isCloze: true, front: "Клиент возвращается, если получил ценность", back: "" });
  });

  it("should keep only the extra after the restored sentence", () => {
    expect(clozeExtra?.front).toBe("Нанимать нужно медленно");
    expect(clozeExtra?.back).toBe("Увольнять быстро");
    expect(clozeExtra?.rawText).toBe("Нанимать нужно {{c1::медленно::подсказка}}\n\nУвольнять быстро");
  });

  it("should put cloze markup into rawText while front stays plain", () => {
    expect(clozeSame?.rawText).toBe("Клиент возвращается, если {{c1::получил ценность}}");
    expect(clozeSame?.front).toBe("Клиент возвращается, если получил ценность");
    expect(clozeExtra?.front).not.toContain("{{");
  });

  it("should treat a raw cloze field as a cloze note and pass it through unchanged", () => {
    const raw = '{{c1::Лид}} входит в {{c2::воронку::этап}}';
    const [note] = parseAnkiExport(`#separator:tab\n"${raw}"\t"Лид входит в воронку"\n`).notes;

    expect(note).toMatchObject({
      isCloze: true,
      front: "Лид входит в воронку",
      back: "",
      rawText: raw,
    });
  });

  it("should decode entities in plain notes", () => {
    expect(entities?.front).toBe("A & B <tag>");
  });

  it("should give a stable 16-hex hash that differs per content", () => {
    const again = parseAnkiExport(text);

    expect(plain?.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(again.notes.map((note) => note.hash)).toEqual(parsed.notes.map((note) => note.hash));
    expect(new Set(parsed.notes.map((note) => note.hash)).size).toBe(7);
  });

  it("should keep source slices that re-join to the original records", () => {
    const rebuilt =
      parsed.headerLines.map((line) => `${line}\n`).join("") + parsed.notes.map((note) => note.source).join("");

    expect(rebuilt).toBe(text);
  });
});

describe("parseAnkiExport on hostile notes", () => {
  it("should flag a note whose raw field is over the cap without converting it", () => {
    const start = performance.now();
    const hostile = parseAnkiExport(`#separator:tab\n"${"{{c1::".repeat(40_000)}"\t"back"\n`);

    expect(hostile.notes[0]).toMatchObject({ oversized: true, rawText: "" });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("should parse a note just under the cap with repeated cloze openers quickly", () => {
    const start = performance.now();
    const hostile = parseAnkiExport(`#separator:tab\n"${"{{c1::".repeat(16_000)}"\t"back"\n`);

    expect(hostile.notes[0]?.oversized).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(500);
  });
});
