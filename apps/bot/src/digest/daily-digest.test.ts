import { describe, it, expect } from "vitest";
import { formatDailyDigest } from "./daily-digest.js";

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
});
