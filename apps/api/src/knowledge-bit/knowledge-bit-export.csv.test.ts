import { describe, expect, it } from "vitest";
import { csvCell, csvHeaderLine, csvLine } from "./knowledge-bit-export.csv.js";
import type { ExportedCard } from "./knowledge-bit-export.repo.js";

const card: ExportedCard = {
  id: "kb1",
  question: 'What does "SELECT 1, 2" do?',
  answer: "Returns\ntwo columns",
  otherQuestions: [{ question: "Fill: SELECT __", answer: "1" }],
  topic: "Basics",
  tags: ["sql", "русский"],
  addedAt: "2026-10-01T00:00:00.000Z",
  example: null,
  subject: "SQL",
  sourceLinks: ["https://a.test", "https://b.test"],
  state: "review",
  dueAt: "2026-10-30T00:00:00.000Z",
  intervalDays: 6,
  ease: 2.5,
  lapses: 1,
  reviewCount: 3,
  lastReviewedAt: "2026-10-24T00:00:00.000Z",
  reviews: [{ reviewedAt: "2026-10-24T00:00:00.000Z", grade: "good", wasNew: false, durationMs: 900 }],
};

describe("csvCell", () => {
  it("should quote cells containing commas, quotes or newlines and double embedded quotes", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });

  it.each(["=SUM(A1)", "+1", "-2", "@cmd", "\tfoo"])(
    "should neutralise a spreadsheet formula starting a card text: %s",
    (text) => {
      expect(csvCell(text).startsWith("'")).toBe(true);
    },
  );

  it("should leave plain text and numbers untouched and write null as empty", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(2.5)).toBe("2.5");
    expect(csvCell(null)).toBe("");
  });

  it("should keep a negative number as a plain number while still guarding the same text", () => {
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell("-2")).toBe("'-2");
  });
});

describe("csvLine", () => {
  it("should carry question, answer, source links, schedule fields and review history", () => {
    const line = csvLine(card);

    expect(line).toContain('"What does ""SELECT 1, 2"" do?"');
    expect(line).toContain('"Returns\ntwo columns"');
    expect(line).toContain("https://a.test | https://b.test");
    expect(line).toContain(",review,2026-10-30T00:00:00.000Z,6,2.5,1,3,");
    expect(line).toContain("2026-10-24T00:00:00.000Z good");
    expect(line.endsWith("\r\n")).toBe(true);
  });

  it("should carry topic, tags, added date and the other questions of the card", () => {
    const line = csvLine(card);

    expect(line).toContain(",Basics,sql | русский,2026-10-01T00:00:00.000Z,Fill: SELECT __ => 1\r\n");
  });

  it("should leave topic, tags and other questions empty for a card without them", () => {
    const line = csvLine({ ...card, topic: null, tags: [], otherQuestions: [] });

    expect(line).toContain(",,,2026-10-01T00:00:00.000Z,\r\n");
  });

  it("should still guard a formula-looking topic or tag", () => {
    const line = csvLine({ ...card, topic: "=1+1", tags: ["@x"] });

    expect(line).toContain("'=1+1,'@x,");
  });
});

describe("csvHeaderLine", () => {
  it("should start with a UTF-8 byte-order mark so Excel reads Russian text correctly", () => {
    expect(csvHeaderLine().startsWith("\uFEFFquestion,")).toBe(true);
    expect(csvHeaderLine()).toContain(",topic,tags,added_at,other_questions\r\n");
  });
});
