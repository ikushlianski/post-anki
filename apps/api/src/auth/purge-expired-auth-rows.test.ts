import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn() } }));

const { createHourlyPurge, PURGE_INTERVAL_MS } = await import("./purge-expired-auth-rows.js");

describe("hourly auth purge", () => {
  it("should run at most once per hour however many sign-in requests arrive", () => {
    const run = vi.fn(async () => undefined);
    let now = 1_000_000;
    const purge = createHourlyPurge(run, () => now);

    purge();
    purge();
    now += PURGE_INTERVAL_MS - 1;
    purge();

    expect(run).toHaveBeenCalledTimes(1);

    now += 1;
    purge();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("should not let a failed purge break the sign-in request", async () => {
    const purge = createHourlyPurge(async () => {
      throw new Error("db down");
    });

    expect(() => purge()).not.toThrow();
    await Promise.resolve();
  });
});
