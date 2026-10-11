import { describe, expect, it } from "vitest";
import { looksLikeDifferentScript, looksLikeSourceMetaReference } from "./knowledge-bit-language-guard.js";

describe("looksLikeDifferentScript", () => {
  it("should flag a Chinese output generated from an English source", () => {
    expect(
      looksLikeDifferentScript(
        "Ribosomes synthesize proteins.",
        "如果细胞中的核糖体全部失活，蛋白质将无法合成。",
      ),
    ).toBe(true);
  });

  it("should not flag a Chinese output generated from a Chinese source", () => {
    expect(
      looksLikeDifferentScript("核糖体合成蛋白质。", "如果核糖体全部失活，蛋白质无法合成。"),
    ).toBe(false);
  });

  it("should not flag an English output that quotes a short Latin code term", () => {
    expect(
      looksLikeDifferentScript(
        "Ribosomes synthesize proteins.",
        "Use SQL-style lookups to query the protein table.",
      ),
    ).toBe(false);
  });

  it("should not flag a Chinese output when the source already contains the same script", () => {
    expect(
      looksLikeDifferentScript("使用 SQL 查询数据库。", "SQL 查询用于读取数据。"),
    ).toBe(false);
  });

  it("should flag a Cyrillic output generated from an English source", () => {
    expect(looksLikeDifferentScript("Water boils at 100 degrees.", "Вода кипит при 100 градусах.")).toBe(
      true,
    );
  });

  it("should not flag a mostly-English output with a single foreign symbol", () => {
    expect(
      looksLikeDifferentScript("Pi is about three point one four.", "Pi (π) is about 3.14."),
    ).toBe(false);
  });

  it("should return false for empty input on either side", () => {
    expect(looksLikeDifferentScript("", "")).toBe(false);
    expect(looksLikeDifferentScript("Some English source.", "")).toBe(false);
    expect(looksLikeDifferentScript("", "Some English output.")).toBe(false);
  });
});

describe("looksLikeSourceMetaReference", () => {
  it("should flag a generated question that refers to the bit in an English source", () => {
    expect(
      looksLikeSourceMetaReference(
        "Selling to large companies differs from typical marketing advice.",
        "How does the bit argue that selling to large companies differs?",
      ),
    ).toBe(true);
  });

  it("should flag each forbidden meta phrase regardless of case", () => {
    const source = "Ribosomes synthesize proteins.";

    expect(looksLikeSourceMetaReference(source, "The Source says so.")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "What does This Item claim?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "Per the author, why?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "What does the passage state?")).toBe(true);
  });

  it("should not flag a clean English question about the claim itself", () => {
    expect(
      looksLikeSourceMetaReference(
        "Ribosomes synthesize proteins.",
        "What would happen to protein synthesis if ribosomes stopped working?",
      ),
    ).toBe(false);
  });

  it("should skip the check when the source is not written in Latin script", () => {
    expect(
      looksLikeSourceMetaReference("核糖体合成蛋白质。", "The bit says ribosomes make protein."),
    ).toBe(false);
  });

  it("should return false for empty generated text", () => {
    expect(looksLikeSourceMetaReference("Ribosomes synthesize proteins.", "")).toBe(false);
  });

  it("should flag Russian meta phrases that point at the source", () => {
    const source = "Продажа софта строится на новом видении будущего.";

    expect(looksLikeSourceMetaReference(source, "Что говорится в тексте о продаже софта?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "Согласно тексту, почему клиент покупает?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "Что, по мнению автора, важнее всего?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "О чём этот отрывок?")).toBe(true);
    expect(looksLikeSourceMetaReference(source, "Что утверждает данный источник?")).toBe(true);
  });

  it("should not flag a clean Russian question about the claim itself", () => {
    expect(
      looksLikeSourceMetaReference(
        "Продажа софта строится на новом видении будущего.",
        "Почему при продаже софта крупной компании не обязательно искать боль клиента?",
      ),
    ).toBe(false);
  });
});
