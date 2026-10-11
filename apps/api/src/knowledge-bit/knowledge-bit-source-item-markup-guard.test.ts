import { describe, expect, it } from "vitest";
import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";

describe("hasInjectedMarkup", () => {
  it("should flag a link the model added that the source never contained", () => {
    expect(hasInjectedMarkup(["Подробности: https://evil.example/x"], "Redis хранит данные в памяти.")).toBe(true);
  });

  it("should accept a link that is present in the source", () => {
    const source = "Документация: https://redis.io/docs/latest/commands/expire/ описывает EXPIRE.";

    expect(hasInjectedMarkup(["Где описана команда EXPIRE: https://redis.io/docs/latest/commands/expire/"], source)).toBe(false);
  });

  it("should flag html tags, markdown links and script schemes added by the model", () => {
    for (const text of ["<script>alert(1)</script>", "[click](http://x.y)", "javascript:alert(1)", "<img src=x onerror=1>"]) {
      expect(hasInjectedMarkup([text], "Обычный текст источника без разметки.")).toBe(true);
    }
  });

  it("should flag invisible control and direction-override characters the source did not have", () => {
    expect(hasInjectedMarkup(["Ответ‮evil"], "Обычный текст.")).toBe(true);
  });

  it("should accept plain study sentences", () => {
    expect(hasInjectedMarkup(["Почему руководство фирмы осознает потребность в покупке софта?"], "Текст.")).toBe(false);
  });
});
