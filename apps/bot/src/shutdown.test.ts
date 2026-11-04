import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBotShutdown, createInflightTracker } from "./shutdown.js";

function setup(closeDb: () => Promise<void> = async () => undefined) {
  const events: string[] = [];
  const server = {
    close: vi.fn(() => void events.push("close")),
    closeIdleConnections: vi.fn(() => void events.push("closeIdle")),
    closeAllConnections: vi.fn(() => void events.push("closeAll")),
  };
  const inflight = createInflightTracker();
  const db = vi.fn(async () => {
    events.push("closeDb");
    await closeDb();
  });
  const exit = vi.fn((code: number) => void events.push(`exit:${code}`));
  const shutdown = createBotShutdown({ server: server as never, inflight, closeDb: db, exit });

  return { events, server, inflight, db, exit, shutdown };
}

describe("bot graceful shutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should stop accepting, let an in-flight update finish, then close the database and exit", async () => {
    const ctx = setup();
    let finish: () => void = () => undefined;

    void ctx.inflight.track(new Promise<void>((resolve) => (finish = resolve)));

    const done = ctx.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(3000);

    expect(ctx.events).toEqual(["close", "closeIdle"]);

    finish();
    await done;

    expect(ctx.events).toEqual(["close", "closeIdle", "closeAll", "closeDb", "exit:0"]);
  });

  it("should stop waiting after 10 seconds for an update that never finishes", async () => {
    const ctx = setup();

    void ctx.inflight.track(new Promise<void>(() => undefined));

    const done = ctx.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(9_999);

    expect(ctx.exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    await done;

    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("should still exit when closing the database fails", async () => {
    const onCloseError = vi.fn();
    const ctx = setup(async () => {
      throw new Error("pool broken");
    });
    const shutdown = createBotShutdown({
      server: ctx.server as never,
      inflight: ctx.inflight,
      closeDb: ctx.db,
      exit: ctx.exit,
      onCloseError,
    });

    await shutdown("SIGINT");

    expect(onCloseError).toHaveBeenCalled();
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("should exit after 5 seconds even if closing the database hangs", async () => {
    const onCloseError = vi.fn();
    const ctx = setup(() => new Promise<void>(() => undefined));
    const shutdown = createBotShutdown({
      server: ctx.server as never,
      inflight: ctx.inflight,
      closeDb: ctx.db,
      exit: ctx.exit,
      onCloseError,
    });

    const done = shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(4_999);

    expect(ctx.exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    await done;

    expect(onCloseError).toHaveBeenCalledWith(expect.objectContaining({ message: "database close timed out" }));
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("should run only once when the signal arrives twice", async () => {
    const ctx = setup();

    await Promise.all([ctx.shutdown("SIGTERM"), ctx.shutdown("SIGTERM")]);

    expect(ctx.server.close).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledTimes(1);
  });
});

describe("inflight tracker", () => {
  it("should be idle at once when nothing is running, and wait for failed work too", async () => {
    const tracker = createInflightTracker();

    await tracker.idle();

    const failing = tracker.track(Promise.reject(new Error("x")));

    failing.catch(() => undefined);

    await expect(tracker.idle()).resolves.toBeUndefined();
  });
});
