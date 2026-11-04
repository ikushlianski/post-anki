import { describe, it, expect } from "vitest";
import { digestKeyboard, formatDailyDigest } from "./daily-digest.js";

describe("formatDailyDigest", () => {
  it("returns just the question when nothing else is due", () => {
    const text = formatDailyDigest({
      dueQueueCount: 0,
      gapsDueCount: 0,
      questionText: "🧭 Opening question",
    });

    expect(text).toBe("🧭 Opening question");
  });

  it("prepends a due-queue count when topics are due for review", () => {
    const text = formatDailyDigest({
      dueQueueCount: 3,
      gapsDueCount: 0,
      questionText: "🧭 Opening question",
    });

    expect(text).toBe("📚 3 topics due for review\n\n🧭 Opening question");
  });

  it("uses singular phrasing for exactly one due topic or gap", () => {
    const text = formatDailyDigest({
      dueQueueCount: 1,
      gapsDueCount: 1,
      questionText: "🧭 Opening question",
    });

    expect(text).toBe(
      "📚 1 topic due for review\n🔁 1 gap due to resurface\n\n🧭 Opening question",
    );
  });

  it("combines due-queue and gap-resurface counts above the question", () => {
    const text = formatDailyDigest({
      dueQueueCount: 4,
      gapsDueCount: 2,
      questionText: "Nothing queued for today.",
    });

    expect(text).toBe(
      "📚 4 topics due for review\n🔁 2 gaps due to resurface\n\nNothing queued for today.",
    );
  });

  it("adds a cards-due line with a review link when flashcards are due", () => {
    const text = formatDailyDigest({
      dueQueueCount: 0,
      gapsDueCount: 0,
      cardsDueCount: 12,
      webBaseUrl: "https://app.test/",
      questionText: "🧭 Opening question",
    });

    expect(text).toBe("🗂 12 cards due — https://app.test/knowledge/review\n\n🧭 Opening question");
  });

  it("omits the cards-due line when no flashcards are due", () => {
    const text = formatDailyDigest({
      dueQueueCount: 0,
      gapsDueCount: 0,
      cardsDueCount: 0,
      questionText: "🧭 Opening question",
    });

    expect(text).toBe("🧭 Opening question");
  });
});

describe("digest streak, triage and buttons", () => {
  const base = { dueQueueCount: 0, gapsDueCount: 0, questionText: "Q?" };

  it("should add a streak line and a waiting-for-triage line with an Inbox link", () => {
    const text = formatDailyDigest({ ...base, streakDays: 4, inboxCount: 12, webBaseUrl: "https://w.example/" });

    expect(text).toContain("🔥 4-day streak");
    expect(text).toContain("📥 12 waiting for triage — https://w.example/knowledge/inbox");
  });

  it("should leave out both lines when the numbers are zero or missing", () => {
    expect(formatDailyDigest({ ...base, streakDays: 0, inboxCount: 0 })).toBe("Q?");
    expect(formatDailyDigest(base)).toBe("Q?");
  });

  it("should offer Pause and an Open review link only when the web address is set", () => {
    const withWeb = digestKeyboard("https://w.example/");

    expect(withWeb[0]!.map((b) => b.text)).toEqual(["⏸ Pause 7 days", "Open review"]);
    expect(withWeb[0]![0]).toMatchObject({ callback_data: "dpause" });
    expect(withWeb[0]![1]).toMatchObject({ url: "https://w.example/knowledge/review" });
    expect(digestKeyboard()[0]!.map((b) => b.text)).toEqual(["⏸ Pause 7 days"]);
  });
});
