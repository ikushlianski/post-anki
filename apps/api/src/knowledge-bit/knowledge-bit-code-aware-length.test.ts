import { describe, expect, it } from "vitest";

import { exceedsLength } from "./knowledge-bit-code-aware-length.js";
import { isQuoteInSource, isQuoteLengthValid } from "./knowledge-bit-source-quote.js";
import { validateBasicCard } from "./knowledge-bit-basic-card-validation.js";

const lines = (count: number): string => Array.from({ length: count }, (_, i) => `    value_${i} = compute(${i})`).join("\n");
const fenced = (count: number): string => `\`\`\`py\n${lines(count)}\n\`\`\``;

describe("exceedsLength", () => {
  it("should keep the plain character limit for prose", () => {
    expect(exceedsLength("a".repeat(301), 300)).toBe(true);
    expect(exceedsLength("a".repeat(300), 300)).toBe(false);
  });

  it("should not count a 15-line code block against the prose limit", () => {
    expect(fenced(15).length).toBeGreaterThan(300);
    expect(exceedsLength(`What does this print?\n${fenced(15)}`, 300)).toBe(false);
  });

  it("should still refuse an oversized code block", () => {
    expect(exceedsLength(fenced(40), 300)).toBe(true);
  });
});

describe("source quote with code", () => {
  const source = `Intro text.\n\n${fenced(15)}\n\nOutro.`;

  it("should accept a multi-line quote of source code that keeps its indentation", () => {
    const quote = lines(15);

    expect(isQuoteLengthValid(quote, source)).toBe(true);
    expect(isQuoteInSource(quote, source)).toBe(true);
  });

  it("should still refuse a long prose quote", () => {
    expect(isQuoteLengthValid("word ".repeat(80), source)).toBe(false);
  });
});

describe("basic card with code", () => {
  it("should accept a card whose front holds a fenced snippet over 300 characters", () => {
    const front = `What does this return?\n${fenced(15)}`;

    expect(validateBasicCard({ front, back: "a list of 15 values" }, front).ok).toBe(true);
  });
});

describe("code caps across blocks and exactness", () => {
  const source = "Intro.\n\n```py\ndef f():\n    if x:\n        return 1\n```\n";

  it("should refuse several small blocks whose total lines exceed the cap", () => {
    expect(exceedsLength(`${fenced(12)}\n\n${fenced(12)}`, 600)).toBe(true);
  });

  it("should refuse several blocks whose total characters exceed the cap", () => {
    const block = `\`\`\`\n${"a".repeat(600)}\n\`\`\``;

    expect(exceedsLength(`${block}\n${block}\n${block}`, 600)).toBe(true);
  });

  it("should reject a card whose code was re-indented", () => {
    const card = { front: "What does f return?", back: "```py\ndef f():\nif x:\nreturn 1\n```" };

    expect(validateBasicCard(card, source)).toMatchObject({ ok: false, reason: "code_not_verbatim" });
  });

  it("should accept a card whose code is exact", () => {
    const card = { front: "What does f return?", back: "```python\ndef f():\n    if x:\n        return 1\n```" };

    expect(validateBasicCard(card, source).ok).toBe(true);
  });
});
