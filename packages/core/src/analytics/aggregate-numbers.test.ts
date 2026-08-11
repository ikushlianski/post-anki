import { describe, it, expect } from "vitest";
import { aggregateNumbers, groupAndAggregate } from "./aggregate-numbers";

describe("aggregateNumbers", () => {
  it("returns null for an empty list of values", () => {
    expect(aggregateNumbers([])).toBeNull();
  });

  it("computes count, average and median for an odd-sized list", () => {
    const result = aggregateNumbers([2, 8, 4]);

    expect(result).toEqual({ count: 3, avg: 14 / 3, median: 4 });
  });

  it("averages the two middle values for an even-sized list", () => {
    const result = aggregateNumbers([10, 20, 30, 40]);

    expect(result).toEqual({ count: 4, avg: 25, median: 25 });
  });
});

describe("groupAndAggregate", () => {
  it("buckets values by key and aggregates each bucket independently", () => {
    const result = groupAndAggregate(
      [
        { key: "react", value: 10 },
        { key: "react", value: 20 },
        { key: "nodejs", value: 5 },
      ],
      ["react", "nodejs"],
    );

    expect(result.get("react")).toEqual({ count: 2, avg: 15, median: 15 });
    expect(result.get("nodejs")).toEqual({ count: 1, avg: 5, median: 5 });
  });

  it("produces null for a requested key with zero entries rather than erroring", () => {
    const result = groupAndAggregate([{ key: "react", value: 10 }], ["react", "aws"]);

    expect(result.get("aws")).toBeNull();
  });

  it("drops null values from a bucket instead of treating them as zero", () => {
    const result = groupAndAggregate(
      [
        { key: "react", value: 10 },
        { key: "react", value: null },
      ],
      ["react"],
    );

    expect(result.get("react")).toEqual({ count: 1, avg: 10, median: 10 });
  });
});
