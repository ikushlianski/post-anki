import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "./graceful-shutdown.js";

function setup(overrides: { flush?: () => Promise<void>; closeDb?: () => Promise<void> } = {}) {
  const events: string[] = [];
  let finishClose: (() => void) | undefined;
  const server = {
    close: vi.fn((cb?: (err?: Error) => void) => {
      events.push("server.close");
      finishClose = () => {
        events.push("server.closed");
        cb?.();
      };

      return server as never;
    }),
    closeIdleConnections: vi.fn(() => events.push("closeIdleConnections")),
    closeAllConnections: vi.fn(() => events.push("closeAllConnections")),
  };
  const flush = vi.fn(overrides.flush ?? (async () => void events.push("flush")));
  const closeDb = vi.fn(overrides.closeDb ?? (async () => void events.push("closeDb")));
  const exit = vi.fn((code: number) => void events.push(`exit:${code}`));
  const shutdown = createGracefulShutdown({ server, flush, closeDb, exit });

  return { events, server, flush, closeDb, exit, shutdown, finishClose: () => finishClose?.() };
}

describe("graceful shutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should let an in-flight request finish before the database closes", async () => {
    const ctx = setup();
    const done = ctx.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(3000);

    expect(ctx.closeDb).not.toHaveBeenCalled();

    ctx.finishClose();
    await done;

    expect(ctx.events).toEqual([
      "server.close",
      "closeIdleConnections",
      "server.closed",
      "closeAllConnections",
      "flush",
      "closeDb",
      "exit:0",
    ]);
  });

  it("should force-close a request still open at 8 seconds and still clean up", async () => {
    const ctx = setup();
    const done = ctx.shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(7999);

    expect(ctx.server.closeAllConnections).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(ctx.server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(ctx.closeDb).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("should ignore a second termination signal while already shutting down", async () => {
    const ctx = setup();
    const first = ctx.shutdown("SIGTERM");

    await ctx.shutdown("SIGINT");
    ctx.finishClose();
    await first;

    expect(ctx.server.close).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledTimes(1);
  });

  it("should still close the database and exit when the tracing flush fails", async () => {
    const ctx = setup({ flush: async () => Promise.reject(new Error("flush failed")) });
    const done = ctx.shutdown("SIGTERM");

    ctx.finishClose();
    await done;

    expect(ctx.closeDb).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("should exit within the cleanup budget when the tracing flush hangs", async () => {
    const ctx = setup({ flush: () => new Promise<void>(() => undefined) });
    const done = ctx.shutdown("SIGTERM");

    ctx.finishClose();
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(ctx.closeDb).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });
});
