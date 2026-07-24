import { describe, expect, it } from "vitest";
import { buildFeedbackDigest, selectRecentFeedback, type FeedbackRow } from "./feedback-digest";

function row(overrides: Partial<FeedbackRow>): FeedbackRow {
  return {
    rating: "down",
    comment: null,
    itemText: "Which caching strategy is safe to apply blindly?",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildFeedbackDigest", () => {
  it("returns null when there is nothing to say", () => {
    expect(buildFeedbackDigest([])).toBeNull();
  });

  it("renders a down vote with a comment as an avoid instruction", () => {
    const digest = buildFeedbackDigest([
      row({ rating: "down", comment: "this asked me to write code, I don't want coding challenges" }),
    ]);

    expect(digest).toContain(
      "- Avoid: this asked me to write code, I don't want coding challenges",
    );
  });

  it("renders a down vote with no comment as a weak dislike signal referencing the item's own text", () => {
    const digest = buildFeedbackDigest([
      row({ rating: "down", comment: null, itemText: "Is caching always safe?" }),
    ]);

    expect(digest).toContain('- Disliked, no reason given: "Is caching always safe?"');
  });

  it("truncates a long item text in the no-reason-given line rather than dumping it whole", () => {
    const longText = "A".repeat(200);

    const digest = buildFeedbackDigest([row({ rating: "down", comment: null, itemText: longText })]);

    expect(digest).not.toBeNull();
    expect(digest).toContain("…");
    expect(digest!.length).toBeLessThan(longText.length + 40);
  });

  it("renders an up vote with a comment as a well-received instruction", () => {
    const digest = buildFeedbackDigest([
      row({
        rating: "up",
        comment: "great, exactly the kind of tradeoff question I want",
      }),
    ]);

    expect(digest).toContain(
      "- Well received: great, exactly the kind of tradeoff question I want",
    );
  });

  it("drops an up vote with no comment — it carries no actionable text", () => {
    const digest = buildFeedbackDigest([row({ rating: "up", comment: null })]);

    expect(digest).toBeNull();
  });

  it("combines multiple rows into multiple bullets in the given order", () => {
    const digest = buildFeedbackDigest([
      row({ rating: "down", comment: "avoid coding challenges" }),
      row({ rating: "up", comment: "keep the tradeoff framing" }),
    ]);

    const avoidIndex = digest!.indexOf("- Avoid: avoid coding challenges");
    const wellReceivedIndex = digest!.indexOf("- Well received: keep the tradeoff framing");

    expect(avoidIndex).toBeGreaterThanOrEqual(0);
    expect(wellReceivedIndex).toBeGreaterThan(avoidIndex);
  });

  it("ignores an all-noise row set and still returns null", () => {
    const digest = buildFeedbackDigest([
      row({ rating: "up", comment: null }),
      row({ rating: "up", comment: "  " }),
    ]);

    expect(digest).toBeNull();
  });
});

describe("selectRecentFeedback", () => {
  function at(hour: number): string {
    return `2026-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`;
  }

  it("returns an empty array when there are no rows", () => {
    expect(selectRecentFeedback([])).toEqual([]);
  });

  it("caps down rows at the 10 most recent, dropping older ones", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ rating: "down", comment: `note ${i}`, updatedAt: at(i) }),
    );

    const selected = selectRecentFeedback(rows);
    const downRows = selected.filter((r) => r.rating === "down");

    expect(downRows).toHaveLength(10);
    expect(downRows.map((r) => r.comment)).toContain("note 14");
    expect(downRows.map((r) => r.comment)).not.toContain("note 0");
  });

  it("caps up-with-comment rows at the 5 most recent, dropping older ones", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ rating: "up", comment: `praise ${i}`, updatedAt: at(i) }),
    );

    const selected = selectRecentFeedback(rows);

    expect(selected).toHaveLength(5);
    expect(selected.map((r) => r.comment)).toContain("praise 7");
    expect(selected.map((r) => r.comment)).not.toContain("praise 0");
  });

  it("drops up rows without a comment entirely — they never count toward the cap", () => {
    const rows = [
      row({ rating: "up", comment: null, updatedAt: at(1) }),
      row({ rating: "up", comment: "keep this one", updatedAt: at(2) }),
    ];

    const selected = selectRecentFeedback(rows);

    expect(selected).toHaveLength(1);
    expect(selected[0]!.comment).toBe("keep this one");
  });

  it("sorts the combined selection most-recent-first across both categories", () => {
    const rows = [
      row({ rating: "down", comment: "old avoid", updatedAt: at(1) }),
      row({ rating: "up", comment: "newer praise", updatedAt: at(3) }),
      row({ rating: "down", comment: "newest avoid", updatedAt: at(5) }),
    ];

    const selected = selectRecentFeedback(rows);

    expect(selected.map((r) => r.comment)).toEqual(["newest avoid", "newer praise", "old avoid"]);
  });

  it("keeps a topic with no feedback yet producing an empty selection", () => {
    expect(selectRecentFeedback([])).toEqual([]);
  });
});
