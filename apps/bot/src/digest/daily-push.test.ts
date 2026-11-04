import { describe, expect, it, vi } from "vitest";
import { createMemoryReminderDayStore, type ReminderDayStore } from "./chat-reminder.js";
import { runDailyPush, type DailyPushDeps } from "./daily-push.js";

vi.mock("../telegram/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeDeps(overrides: Partial<DailyPushDeps> = {}): DailyPushDeps {
  return {
    now: () => new Date("2026-10-29T08:00:00Z"),
    getTimeZone: async () => "UTC",
    isPaused: async () => false,
    pushStore: createMemoryReminderDayStore(),
    reminderStore: createMemoryReminderDayStore(),
    sendQuestion: vi.fn().mockResolvedValue("Q?"),
    getReminderText: vi.fn().mockResolvedValue("reminder"),
    sendDigest: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runDailyPush", () => {
  it("should send the question and the digest with the Chat reminder once", async () => {
    const deps = makeDeps();

    expect(await runDailyPush(deps)).toBe("sent");
    expect(deps.sendQuestion).toHaveBeenCalledOnce();
    expect(deps.sendDigest).toHaveBeenCalledWith("Q?", "reminder");
  });

  it("should not send anything when the push is triggered twice on the same day", async () => {
    const deps = makeDeps();

    await runDailyPush(deps);

    expect(await runDailyPush(deps)).toBe("duplicate");
    expect(deps.sendQuestion).toHaveBeenCalledOnce();
    expect(deps.sendDigest).toHaveBeenCalledOnce();
  });

  it("should send again the next day in the saved time zone", async () => {
    const deps = makeDeps({ getTimeZone: async () => "Asia/Tokyo" });
    await runDailyPush(deps);

    const later = { ...deps, now: () => new Date("2026-10-29T15:30:00Z") };
    expect(await runDailyPush(later)).toBe("sent");
  });

  it("should do nothing while reminders are paused", async () => {
    const deps = makeDeps({ isPaused: async () => true });

    expect(await runDailyPush(deps)).toBe("paused");
    expect(deps.sendQuestion).not.toHaveBeenCalled();
  });

  it("should keep the Chat reminder unclaimed and retry with it when the digest send fails", async () => {
    const sendDigest = vi.fn().mockRejectedValueOnce(new Error("telegram down")).mockResolvedValue(undefined);
    const claimDay = vi.fn().mockResolvedValue(true);
    const reminderStore: ReminderDayStore = { claimDay, releaseDay: vi.fn() };
    const deps = makeDeps({ sendDigest, reminderStore });

    await expect(runDailyPush(deps)).rejects.toThrow("telegram down");
    expect(claimDay).not.toHaveBeenCalled();
    expect(await runDailyPush(deps)).toBe("sent");
    expect(sendDigest).toHaveBeenLastCalledWith("Q?", "reminder");
    expect(claimDay).toHaveBeenCalledOnce();
  });

  it("should release the push claim when the question fails to send", async () => {
    const sendQuestion = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("Q?");
    const deps = makeDeps({ sendQuestion });

    await expect(runDailyPush(deps)).rejects.toThrow("boom");
    expect(await runDailyPush(deps)).toBe("sent");
  });

  it("should not claim the reminder slot when there is no reminder text", async () => {
    const claimDay = vi.fn();
    const reminderStore: ReminderDayStore = { claimDay, releaseDay: vi.fn() };
    const deps = makeDeps({ reminderStore, getReminderText: async () => null });

    await runDailyPush(deps);

    expect(claimDay).not.toHaveBeenCalled();
    expect(deps.sendDigest).toHaveBeenCalledWith("Q?", null);
  });

  it("should still report the push as sent when marking the reminder fails after sending", async () => {
    const reminderStore: ReminderDayStore = {
      claimDay: vi.fn().mockRejectedValue(new Error("db down")),
      releaseDay: vi.fn(),
    };
    const deps = makeDeps({ reminderStore });

    expect(await runDailyPush(deps)).toBe("sent");
    expect(deps.sendDigest).toHaveBeenCalledWith("Q?", "reminder");
  });

  it("should leave the reminder to a later day's push once it was claimed and sent", async () => {
    const deps = makeDeps();
    await runDailyPush(deps);

    const nextDay = { ...deps, now: () => new Date("2026-10-30T08:00:00Z") };
    await runDailyPush(nextDay);

    expect(deps.sendDigest).toHaveBeenLastCalledWith("Q?", "reminder");
  });
});
