import { describe, expect, it } from "vitest";
import { createDailyReminderGate, formatChatReminder, type ReminderDayStore } from "./chat-reminder.js";

const now = new Date("2026-10-29T08:00:00Z");

describe("formatChatReminder", () => {
  it("should stay silent when no Chat card has waited over three days", () => {
    expect(formatChatReminder({ summary: { count: 0, oldestChatAt: null }, now })).toBeNull();
  });

  it("should state the count and the oldest wait in days", () => {
    const text = formatChatReminder({
      summary: { count: 4, oldestChatAt: "2026-10-19T08:00:00Z" },
      now,
    });

    expect(text).toBe("💬 4 Chat cards have been waiting over 3 days. The oldest has waited 10 days.");
  });

  it("should use singular wording for one card", () => {
    const text = formatChatReminder({ summary: { count: 1, oldestChatAt: "2026-10-25T08:00:00Z" }, now });

    expect(text).toContain("1 Chat card has been waiting");
  });

  it("should link to the Chat page when a base URL is configured", () => {
    const text = formatChatReminder({
      summary: { count: 2, oldestChatAt: "2026-10-20T08:00:00Z" },
      now,
      webBaseUrl: "https://postanki.ilya.online/",
    });

    expect(text?.endsWith("\nhttps://postanki.ilya.online/knowledge/chat")).toBe(true);
  });
});

describe("createDailyReminderGate", () => {
  it("should allow only one reminder per calendar day", async () => {
    const gate = createDailyReminderGate();

    expect(await gate(new Date("2026-10-29T08:00:00Z"))).toBe(true);
    expect(await gate(new Date("2026-10-29T20:00:00Z"))).toBe(false);
    expect(await gate(new Date("2026-10-30T08:00:00Z"))).toBe(true);
  });

  it("should not resend the same day after a restart when the store is durable", async () => {
    const saved = { day: null as string | null };
    const store: ReminderDayStore = {
      async releaseDay() {},
      async claimDay(day) {
        if (saved.day === day) {
          return false;
        }

        saved.day = day;

        return true;
      },
    };

    expect(await createDailyReminderGate(store)(new Date("2026-10-29T08:00:00Z"))).toBe(true);
    expect(await createDailyReminderGate(store)(new Date("2026-10-29T09:00:00Z"))).toBe(false);
  });
});
