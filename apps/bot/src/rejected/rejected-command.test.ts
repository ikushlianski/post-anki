import { describe, expect, it, vi } from "vitest";
import type { RejectedCard } from "@post-anki/shared";
import { REJECTED_UNREACHABLE_REPLY, handleRejectedCommand } from "./rejected-command.handler.js";
import {
  EMPTY_REJECTED_REPLY,
  TELEGRAM_MESSAGE_LIMIT,
  formatRejectedReply,
  previewRejectNote,
  previewRejectedBody,
} from "./rejected-command.js";

const card = (over: Partial<RejectedCard> = {}): RejectedCard => ({
  knowledgeBitId: "kb1",
  body: "What is a mutex?",
  reasonCode: "wrong_language",
  decidedAt: "2026-10-28T00:00:00Z",
  ...over,
});

function makeDeps(items: RejectedCard[] = [card()], webBaseUrl?: string) {
  return {
    fetchRejected: vi.fn().mockResolvedValue({ items, hasMore: false }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    webBaseUrl,
  };
}

describe("previews at the cut", () => {
  it("should not split an emoji when shortening a card preview or a note", () => {
    const card = previewRejectedBody(`${"a".repeat(119)}😀 tail`);
    const note = previewRejectNote(`${"a".repeat(59)}😀 tail`);

    expect(() => encodeURIComponent(card)).not.toThrow();
    expect(() => encodeURIComponent(note ?? "")).not.toThrow();
  });
});

describe("formatRejectedReply", () => {
  it("should show a friendly empty message when nothing was rejected", () => {
    expect(formatRejectedReply({ items: [] })).toBe(EMPTY_REJECTED_REPLY);
  });

  it("should truncate long card bodies and show the human reason label", () => {
    const reply = formatRejectedReply({ items: [card({ body: "x".repeat(300) })] });

    expect(reply).toContain(`${"x".repeat(120)}…`);
    expect(reply).not.toContain("x".repeat(121));
    expect(reply).toContain("Reason: Wrong language");
  });

  it("should append the typed note, flattened and cut to 60 characters, after the reason", () => {
    const reply = formatRejectedReply({
      items: [card({ note: `too\n  vague ${"y".repeat(100)}` })],
    });

    expect(reply).toContain(`Reason: Wrong language — too vague ${"y".repeat(50)}…`);
    expect(reply).not.toContain("y".repeat(51));
  });

  it("should keep markdown characters in a long note verbatim and within the Telegram limit", () => {
    const note = "*bold* _it_ [x](http://a.b) `code` ".repeat(10);
    const reply = formatRejectedReply({ items: Array.from({ length: 5 }, () => card({ note })) });

    expect(reply).toContain("— *bold* _it_ [x](http://a.b) `code`");
    expect(reply).toContain("…");
    expect(reply.length).toBeLessThanOrEqual(4096);
  });

  it("should leave the reason line unchanged when the note is missing or blank", () => {
    for (const note of [undefined, null, "   "]) {
      expect(formatRejectedReply({ items: [card({ note })] })).toMatch(/Reason: Wrong language$/m);
    }
  });

  it("should say no reason given for unspecified rejections", () => {
    expect(formatRejectedReply({ items: [card({ reasonCode: "unspecified" })] })).toContain(
      "Reason: No reason given",
    );
  });

  it("should list at most five cards", () => {
    const items = Array.from({ length: 8 }, (_, i) => card({ body: `card-${i}` }));

    expect(formatRejectedReply({ items }).match(/•/g)).toHaveLength(5);
  });

  it("should end with the Rejected page link only when a web base url is set", () => {
    expect(formatRejectedReply({ items: [card()], webBaseUrl: "https://x.test/" })).toMatch(
      /\nhttps:\/\/x\.test\/knowledge\/rejected$/,
    );
    expect(formatRejectedReply({ items: [card()] })).not.toContain("http");
  });
});

describe("formatRejectedReply hidden cards", () => {
  const five = Array.from({ length: 5 }, (_, i) => card({ body: `card-${i}` }));

  it("should say how many more rejected cards exist and link to the Rejected page", () => {
    const reply = formatRejectedReply({
      items: five,
      hasMore: true,
      reasonCounts: { wrong_language: 9, other: 3 },
      webBaseUrl: "https://x.test/",
    });

    expect(reply).toMatch(/\n\+7 more — open Rejected: https:\/\/x\.test\/knowledge\/rejected$/);
  });

  it("should count only the filtered reason when a reason is requested", () => {
    const reply = formatRejectedReply({
      items: five,
      hasMore: true,
      reason: "wrong_language",
      reasonCounts: { wrong_language: 8, other: 40 },
    });

    expect(reply).toMatch(/\n\+3 more$/);
  });

  it("should still flag more cards without a number when counts are missing", () => {
    expect(formatRejectedReply({ items: five, hasMore: true })).toMatch(/\nMore rejected cards$/);
  });

  it("should add no more-line when everything fits", () => {
    expect(formatRejectedReply({ items: five, hasMore: false })).not.toContain("more");
  });
});

describe("formatRejectedReply reason counts", () => {
  it("should start with one line of non-zero counts, biggest first", () => {
    const reply = formatRejectedReply({
      items: [card()],
      reasonCounts: { wrong_language: 1, unspecified: 3, other: 0 },
    });

    expect(reply.split("\n")[0]).toBe("Reasons: No reason given 3 · Wrong language 1");
  });

  it("should omit the line when counts are absent or all zero", () => {
    expect(formatRejectedReply({ items: [card()] })).not.toContain("Reasons:");
    expect(
      formatRejectedReply({ items: [card()], reasonCounts: { wrong_language: 0 } }),
    ).not.toContain("Reasons:");
  });

  it("should stay under the Telegram message limit", () => {
    const reasonCounts = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`code_${i}_${"y".repeat(20)}`, i + 1]),
    );

    expect(formatRejectedReply({ items: [card()], reasonCounts }).length).toBeLessThanOrEqual(
      TELEGRAM_MESSAGE_LIMIT,
    );
  });
});

describe("handleRejectedCommand", () => {
  it("should pass the per-reason counts through to the reply", async () => {
    const deps = makeDeps();
    deps.fetchRejected.mockResolvedValue({
      items: [card()],
      hasMore: false,
      reasonCounts: { wrong_language: 2 },
    });
    await handleRejectedCommand(1, null, deps);

    expect(deps.sendMessage).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Reasons: Wrong language 2"),
    );
  });

  it("should fetch the latest five and reply with them", async () => {
    const deps = makeDeps();
    await handleRejectedCommand(1, null, deps);

    expect(deps.fetchRejected).toHaveBeenCalledWith({ limit: 5 });
    expect(deps.sendMessage).toHaveBeenCalledWith(1, expect.stringContaining("What is a mutex?"));
  });

  it("should filter by a valid reason code", async () => {
    const deps = makeDeps();
    await handleRejectedCommand(1, "wrong_language", deps);

    expect(deps.fetchRejected).toHaveBeenCalledWith({ limit: 5, reason: "wrong_language" });
  });

  it("should search by the words when the argument is not a reason code", async () => {
    const deps = makeDeps();
    await handleRejectedCommand(1, "  mutex   lock ", deps);

    expect(deps.fetchRejected).toHaveBeenCalledWith({ limit: 5, q: "mutex lock" });
    expect(deps.sendMessage).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Rejected cards matching "mutex lock":'),
    );
  });

  it("should say nothing matched when the search finds no cards", async () => {
    const deps = makeDeps([]);
    await handleRejectedCommand(1, "foo", deps);

    expect(deps.sendMessage).toHaveBeenCalledWith(1, 'No rejected cards match "foo".');
  });

  it("should cut a search longer than 200 characters", async () => {
    const deps = makeDeps();
    await handleRejectedCommand(1, "a".repeat(500), deps);

    expect(deps.fetchRejected).toHaveBeenCalledWith({ limit: 5, q: "a".repeat(200) });
  });

  it("should reply with a friendly line when the API is unreachable", async () => {
    const deps = makeDeps();
    deps.fetchRejected.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(handleRejectedCommand(1, null, deps)).resolves.toBeUndefined();
    expect(deps.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.sendMessage).toHaveBeenCalledWith(1, REJECTED_UNREACHABLE_REPLY);
  });
});
