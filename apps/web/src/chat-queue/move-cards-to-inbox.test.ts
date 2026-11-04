import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./chat-queue.api", () => ({
  returnFromChatQueue: vi.fn(),
}));

import { returnFromChatQueue } from "./chat-queue.api";
import { moveCardsToInbox } from "./use-chat-queue-bulk";

type Deferred = {
  id: string;
  resolve: (ok: boolean) => void;
  reject: () => void;
};

function setup() {
  const pending: Deferred[] = [];
  let inFlight = 0;
  let peak = 0;

  vi.mocked(returnFromChatQueue).mockImplementation(((args: {
    data: { bitId: string };
  }) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);

    return new Promise((resolve, reject) => {
      pending.push({
        id: args.data.bitId,
        resolve: (ok) => {
          inFlight -= 1;
          resolve({ ok });
        },
        reject: () => {
          inFlight -= 1;
          reject(new Error("boom"));
        },
      });
    });
  }) as never);

  return { pending, getPeak: () => peak };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.resetAllMocks();
});

describe("moveCardsToInbox concurrency", () => {
  it("should never run more than three moves at once and still process every card", async () => {
    const { pending, getPeak } = setup();
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const run = moveCardsToInbox(ids);

    await tick();
    expect(pending).toHaveLength(3);

    while (pending.length > 0) {
      pending.shift()!.resolve(true);
      await tick();
    }

    const result = await run;

    expect(getPeak()).toBe(3);
    expect([...result.moved].sort()).toEqual([...ids].sort());
    expect(result.failed).toEqual([]);
    expect(vi.mocked(returnFromChatQueue)).toHaveBeenCalledTimes(10);
  });

  it("should keep going when some moves are rejected or report not ok", async () => {
    const { pending, getPeak } = setup();
    const ids = ["a", "b", "c", "d", "e", "f"];
    const run = moveCardsToInbox(ids);

    await tick();

    while (pending.length > 0) {
      const item = pending.shift()!;

      if (item.id === "a") item.reject();
      else if (item.id === "d") item.resolve(false);
      else item.resolve(true);
      await tick();
    }

    const result = await run;

    expect(getPeak()).toBeLessThanOrEqual(3);
    expect([...result.moved].sort()).toEqual(["b", "c", "e", "f"]);
    expect([...result.failed].sort()).toEqual(["a", "d"]);
  });

  it("should start only as many moves as there are cards when fewer than three", async () => {
    const { pending } = setup();
    const run = moveCardsToInbox(["x", "y"]);

    await tick();
    expect(pending).toHaveLength(2);

    pending.forEach((p) => p.resolve(true));

    expect((await run).moved.sort()).toEqual(["x", "y"]);
  });
});
