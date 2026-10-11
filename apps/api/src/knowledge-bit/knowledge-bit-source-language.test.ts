import { describe, expect, it } from "vitest";
import { buildSourceLanguageLine, detectSourceLanguage } from "./knowledge-bit-source-language.js";

describe("buildSourceLanguageLine", () => {
  it("should tell the model to write Russian for a Cyrillic source", () => {
    expect(buildSourceLanguageLine("Руководство фирмы осознает потребность в покупке софта.")).toBe(
      "The source is written in Russian (Cyrillic). Write every field in Russian.",
    );
  });

  it("should tell the model to write English for a Latin source", () => {
    expect(buildSourceLanguageLine("An index lets the engine find rows without scanning the table.")).toBe(
      "The source is written in English. Write every field in English.",
    );
  });

  it("should still call a Russian text with English technical terms Russian", () => {
    expect(detectSourceLanguage("Индекс в SQL базе ускоряет запросы, а Redis хранит кэш для API.")).toBe("Russian");
  });

  it("should still call an English text with a couple of Russian words English", () => {
    expect(detectSourceLanguage("The Russian word борщ names a beet soup that people eat in winter.")).toBe("English");
  });

  it("should fall back to the same language as the source for other scripts and non-letters", () => {
    const fallback = "Write every field in the same language as the source text.";

    expect(buildSourceLanguageLine("光合作用是植物把光能转化为化学能的过程")).toBe(fallback);
    expect(buildSourceLanguageLine("12345 !!!")).toBe(fallback);
  });
});
