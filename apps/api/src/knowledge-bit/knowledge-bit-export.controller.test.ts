import type http from "node:http";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportedCard } from "./knowledge-bit-export.repo.js";

const streamApprovedCards = vi.fn();

vi.mock("./knowledge-bit-export.repo.js", () => ({
  streamApprovedCards: (...args: unknown[]) => streamApprovedCards(...args),
}));

const { handleExportKnowledgeBits } = await import("./knowledge-bit-export.controller.js");

function fakeRes() {
  const res = Object.assign(new EventEmitter(), {
    status: null as number | null,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status;
      res.headers = headers;
    },
    write(chunk: string): boolean {
      res.chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) {
        res.chunks.push(chunk);
      }
    },
  });

  return res;
}

function card(id: string, question: string): ExportedCard {
  return {
    id,
    question,
    answer: "A",
    otherQuestions: [{ question: "Q-extra", answer: "A-extra" }],
    topic: "T",
    tags: ["t1"],
    addedAt: "2026-10-01T00:00:00.000Z",
    example: "Ex",
    subject: "SQL",
    sourceLinks: ["https://a.test"],
    state: "review",
    dueAt: "2026-10-30T00:00:00.000Z",
    intervalDays: 6,
    ease: 2.5,
    lapses: 2,
    reviewCount: 4,
    lastReviewedAt: null,
    reviews: [{ reviewedAt: "2026-10-24T00:00:00.000Z", grade: "good", wasNew: true, durationMs: null }],
  };
}

async function* batches(...groups: ExportedCard[][]) {
  for (const group of groups) {
    yield group;
  }
}

function run(search: string) {
  const res = fakeRes();

  return handleExportKnowledgeBits(res as unknown as http.ServerResponse, search).then(() => res);
}

describe("handleExportKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should download every card across batches as one valid JSON file with a dated filename", async () => {
    streamApprovedCards.mockReturnValue(batches([card("1", "Q1")], [card("2", "Q2")]));

    const res = await run("?format=json");
    const body = JSON.parse(res.chunks.join("")) as { cards: ExportedCard[] };

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="post-anki-cards-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(body.cards.map((c) => c.id)).toEqual(["1", "2"]);
    expect(body.cards[0]).toMatchObject({
      question: "Q1",
      answer: "A",
      example: "Ex",
      subject: "SQL",
      sourceLinks: ["https://a.test"],
      state: "review",
      dueAt: "2026-10-30T00:00:00.000Z",
      intervalDays: 6,
      ease: 2.5,
      lapses: 2,
      topic: "T",
      tags: ["t1"],
      addedAt: "2026-10-01T00:00:00.000Z",
      otherQuestions: [{ question: "Q-extra", answer: "A-extra" }],
    });
    expect(body.cards[0]?.reviews).toHaveLength(1);
  });

  it("should produce an empty but valid JSON file when the learner has no approved cards", async () => {
    streamApprovedCards.mockReturnValue(batches());

    const res = await run("");

    expect(JSON.parse(res.chunks.join("")).cards).toEqual([]);
  });

  it("should download CSV with a header row, escaped cells and a csv filename", async () => {
    streamApprovedCards.mockReturnValue(batches([card("1", "=HYPERLINK(1)"), card("2", 'say "hi", ok')]));

    const res = await run("?format=csv");
    const text = res.chunks.join("");

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/\.csv"$/);
    expect(text.startsWith("\uFEFFquestion,answer,example,subject,source_links,state,due_at,interval_days,ease,lapses")).toBe(true);
    expect(text).toContain("'=HYPERLINK(1)");
    expect(text).toContain('"say ""hi"", ok"');
  });

  it("should stop reading cards and finish when the client disconnects mid-download", async () => {
    let closed = false;

    async function* endless() {
      try {
        for (;;) {
          yield [card("1", "Q1")];
        }
      } finally {
        closed = true;
      }
    }

    streamApprovedCards.mockReturnValue(endless());

    const res = fakeRes();

    res.write = (chunk: string) => {
      res.chunks.push(chunk);

      if (res.chunks.length < 2) {
        return true;
      }

      setImmediate(() => res.emit("close"));

      return false;
    };

    await handleExportKnowledgeBits(res as unknown as http.ServerResponse, "?format=json");

    expect(closed).toBe(true);
    expect(res.chunks.length).toBeLessThan(5);
  });

  it("should reject an unknown format before streaming anything", async () => {
    const res = await run("?format=xml");

    expect(res.status).toBe(400);
    expect(streamApprovedCards).not.toHaveBeenCalled();
  });
});
