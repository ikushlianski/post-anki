import { describe, expect, it, vi } from "vitest";
import {
  describeResumeDay,
  formatPauseReply,
  isRemindersPaused,
  localDay,
  parsePauseDays,
  resumeDayAfter,
  RESUME_REPLY,
  type ReminderPauseStore,
} from "./reminder-pause.js";
import { handlePauseCommand, handleResumeCommand } from "./pause-command.handler.js";

function memoryStore(initial: string | null = null): ReminderPauseStore {
  let day = initial;

  return {
    getResumeDay: async () => day,
    setResumeDay: async (d) => {
      day = d;
    },
    clear: async () => {
      day = null;
    },
  };
}

describe("parsePauseDays", () => {
  it("should default to 7 days when no number is given", () => {
    expect(parsePauseDays(null)).toBe(7);
    expect(parsePauseDays("  ")).toBe(7);
  });

  it("should use the requested number of days", () => {
    expect(parsePauseDays("3")).toBe(3);
  });

  it("should cap a long holiday at 30 days", () => {
    expect(parsePauseDays("90")).toBe(30);
  });

  it("should reject zero, negative or non-numeric days so the user is asked again", () => {
    expect(parsePauseDays("0")).toBeNull();
    expect(parsePauseDays("-4")).toBeNull();
    expect(parsePauseDays("soon")).toBeNull();
  });
});

describe("isRemindersPaused", () => {
  const now = new Date("2026-10-28T08:00:00Z");

  it("should not be paused when nothing was set", async () => {
    expect(await isRemindersPaused(memoryStore(), now)).toBe(false);
  });

  it("should stay paused until the resume day arrives", async () => {
    expect(await isRemindersPaused(memoryStore("2026-10-29"), now)).toBe(true);
    expect(await isRemindersPaused(memoryStore("2026-10-28"), now)).toBe(false);
  });
});

describe("pause and resume commands", () => {
  it("should store the resume day and confirm to the owner", async () => {
    const store = memoryStore();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handlePauseCommand(7, "3", { store, sendMessage, now: () => new Date("2026-10-28T08:00:00Z") });

    expect(await store.getResumeDay()).toBe(resumeDayAfter(new Date("2026-10-28T08:00:00Z"), 3));
    expect(sendMessage).toHaveBeenCalledWith(7, expect.stringContaining("paused for 3 days"));
  });

  it("should pause for 7 days when /pause has no argument", async () => {
    const store = memoryStore();

    await handlePauseCommand(7, null, {
      store,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      now: () => new Date("2026-10-28T08:00:00Z"),
    });

    expect(await store.getResumeDay()).toBe("2026-11-04");
  });

  it("should ask again and leave reminders unchanged when /pause gets 0 or a word", async () => {
    const store = memoryStore();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handlePauseCommand(7, "0", { store, sendMessage });
    await handlePauseCommand(7, "soon", { store, sendMessage });

    expect(await store.getResumeDay()).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(7, expect.stringContaining("whole number of days"));
  });

  it("should clear the pause on /resume", async () => {
    const store = memoryStore("2026-11-04");
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleResumeCommand(7, { store, sendMessage });

    expect(await store.getResumeDay()).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith(7, RESUME_REPLY);
  });
});

describe("time zone aware pause days", () => {
  it("should count the resume day in the saved time zone, not UTC", () => {
    const lateEveningUtc = new Date("2026-10-28T23:30:00Z");

    expect(resumeDayAfter(lateEveningUtc, 7)).toBe("2026-11-04");
    expect(resumeDayAfter(lateEveningUtc, 7, "Asia/Tokyo")).toBe("2026-11-05");
  });

  it("should compare today in the saved time zone when checking the pause", async () => {
    const now = new Date("2026-10-28T23:30:00Z");

    expect(localDay(now, "Asia/Tokyo")).toBe("2026-10-29");
    expect(await isRemindersPaused(memoryStore("2026-10-29"), now, "Asia/Tokyo")).toBe(false);
    expect(await isRemindersPaused(memoryStore("2026-10-29"), now)).toBe(true);
  });

  it("should fall back to UTC for an unknown time zone", () => {
    expect(localDay(new Date("2026-10-28T23:30:00Z"), "Not/AZone")).toBe("2026-10-28");
  });

  it("should name the weekday and date in the pause reply instead of a raw date", () => {
    expect(describeResumeDay("2026-11-05")).toBe("Thursday 5 November");
    expect(formatPauseReply(7, "2026-11-05")).toContain("They come back on Thursday 5 November.");
    expect(formatPauseReply(7, "2026-11-05")).not.toContain("2026-11-05");
  });

  it("should pause using the saved time zone from the Pause button", async () => {
    const store = memoryStore();
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handlePauseCommand(7, "7", {
      store,
      sendMessage,
      now: () => new Date("2026-10-28T23:30:00Z"),
      getTimeZone: async () => "Asia/Tokyo",
    });

    expect(await store.getResumeDay()).toBe("2026-11-05");
    expect(sendMessage).toHaveBeenCalledWith(7, expect.stringContaining("Thursday 5 November"));
  });
});
