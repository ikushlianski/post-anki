import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../shared/inngest-client.js", () => ({ createInngestClient: () => ({ send: vi.fn() }) }));

const { dispatchBackgroundJob } = await import("./background-job.starter.js");

const job = { kind: "lecture-compile", topicId: "t1" } as const;

function deps(isDurable: boolean) {
  return { isDurable: () => isDurable, send: vi.fn().mockResolvedValue(undefined) };
}

describe("dispatchBackgroundJob", () => {
  it("should run the work in-process and send no event when the durable flag is off", async () => {
    const d = deps(false);
    const inProcess = vi.fn().mockResolvedValue(undefined);

    await dispatchBackgroundJob(job, inProcess, vi.fn(), d);

    expect(inProcess).toHaveBeenCalledOnce();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("should hand the job to the queue and not run it in the request when the durable flag is on", async () => {
    const d = deps(true);
    const inProcess = vi.fn();

    await dispatchBackgroundJob(job, inProcess, vi.fn(), d);

    expect(d.send).toHaveBeenCalledWith(job);
    expect(inProcess).not.toHaveBeenCalled();
  });

  it("should still finish the work before returning when the queue is unreachable", async () => {
    const d = deps(true);
    let finished = false;

    d.send.mockRejectedValue(new Error("down"));

    await dispatchBackgroundJob(
      job,
      async () => {
        await Promise.resolve();
        finished = true;
      },
      vi.fn(),
      d,
    );

    expect(finished).toBe(true);
  });

  it("should report a failing job without throwing into the response", async () => {
    const d = deps(true);
    const onError = vi.fn();

    d.send.mockRejectedValue(new Error("down"));

    await expect(
      dispatchBackgroundJob(job, () => Promise.reject(new Error("fail")), onError, d),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
  });
});
