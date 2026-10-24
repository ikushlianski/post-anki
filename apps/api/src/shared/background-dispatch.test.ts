import { describe, expect, it, vi } from "vitest";

vi.mock("./log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const { dispatchBackground } = await import("./background-dispatch.js");

describe("dispatchBackground", () => {
  it("should finish the work before returning when the job is durable so Lambda does not freeze it", async () => {
    let finished = false;

    await dispatchBackground({
      durable: true,
      start: async () => {
        await Promise.resolve();
        finished = true;
      },
      onError: vi.fn(),
    });

    expect(finished).toBe(true);
  });

  it("should return before slow in-process work ends when the job is not durable", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = vi.fn(() => gate);

    await dispatchBackground({ durable: false, start, onError: vi.fn() });

    expect(start).toHaveBeenCalledOnce();
    release();
  });

  it("should report a failed start to the error handler without failing the caller", async () => {
    const onError = vi.fn();
    const err = new Error("boom");

    await expect(
      dispatchBackground({ durable: true, start: () => Promise.reject(err), onError }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(err);
  });

  it("should not fail the caller when the error handler itself throws", async () => {
    await expect(
      dispatchBackground({
        durable: true,
        start: () => Promise.reject(new Error("boom")),
        onError: () => Promise.reject(new Error("handler failed")),
      }),
    ).resolves.toBeUndefined();
  });

  it("should not leave an unhandled rejection when a detached job fails", async () => {
    const onError = vi.fn();

    await dispatchBackground({ durable: false, start: () => Promise.reject(new Error("x")), onError });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledOnce();
  });
});
