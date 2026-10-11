import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./map-with-concurrency.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("should never run more than the limit at the same time", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 4, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    });

    expect(maxActive).toBe(4);
  });

  it("should keep results in input order even when later items finish first", async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];

    const pending = mapWithConcurrency([0, 1, 2], 3, async (index) => {
      await gates[index]!.promise;
      return `item-${index}`;
    });

    gates[2]!.resolve();
    gates[0]!.resolve();
    gates[1]!.resolve();

    expect(await pending).toEqual([
      { status: "fulfilled", value: "item-0" },
      { status: "fulfilled", value: "item-1" },
      { status: "fulfilled", value: "item-2" },
    ]);
  });

  it("should report a rejected item without stopping the other items", async () => {
    const processed: number[] = [];

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      processed.push(item);

      if (item === 2) {
        throw new Error("boom");
      }

      return item * 10;
    });

    expect(processed.sort()).toEqual([1, 2, 3, 4]);
    expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(results[1]).toMatchObject({ status: "rejected", reason: new Error("boom") });
    expect(results[2]).toEqual({ status: "fulfilled", value: 30 });
    expect(results[3]).toEqual({ status: "fulfilled", value: 40 });
  });

  it("should return an empty array without calling the function for empty input", async () => {
    const fn = async () => "never";

    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
  });

  it("should reject a limit that is not a positive integer", async () => {
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(RangeError);
  });
});
