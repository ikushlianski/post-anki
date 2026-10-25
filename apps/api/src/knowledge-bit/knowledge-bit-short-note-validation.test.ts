import { describe, expect, it } from "vitest";
import { validateSourceItems } from "./knowledge-bit-source-item-validation.js";

describe("short Russian business notes", () => {
  const SOURCE_TEXT =
    "Поймите, что рынок – это океан, а не маленький пруд. Если кто-то поймал рыбу, это не значит, что рыба в океане закончилась. Продажи – не фиксированное количество денег, которые раздаются между продавцами.";
  const QUOTE = "рынок – это океан, а не маленький пруд";
  const lesson = (question: string, answer: string) => ({
    statement: answer,
    quote: QUOTE,
    example: null,
    cards: [{ kind: "basic" as const, statement: answer, question, answer, quote: QUOTE }],
  });

  it("should keep a direct question with a short answer for a short note", () => {
    const result = validateSourceItems(
      [lesson("Почему рынок стоит считать океаном, а не прудом?", "Успех одного продавца не отнимает рынок у других.")],
      SOURCE_TEXT,
    );

    expect(result.dropped).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });

  it("should still drop a card that names the author of the note", () => {
    const result = validateSourceItems(
      [lesson("Как относиться к рынку?", "По мнению автора, рынок не ограничен.")],
      SOURCE_TEXT,
    );

    expect(result.dropped).toEqual(["source_meta_reference"]);
  });

  it("should still drop a yes/no question about the note", () => {
    const result = validateSourceItems([lesson("Правда ли, что рынок ограничен?", "Нет, рынок не ограничен.")], SOURCE_TEXT);

    expect(result.dropped).toEqual(["bad_card"]);
  });
});
