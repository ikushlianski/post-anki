import { describe, expect, it, vi } from "vitest";
import { describeFailure, probeReachable } from "./probe.js";

describe("describeFailure", () => {
  it("should describe an aborted probe as a timeout", () => {
    const abortError = new DOMException("aborted", "AbortError");

    expect(describeFailure(abortError)).toBe("Timed out reaching Post Anki.");
  });

  it("should describe any other error as an unreachable network", () => {
    expect(describeFailure(new TypeError("failed to fetch"))).toBe("Network unreachable.");
  });
});

describe("probeReachable", () => {
  it("should report reachable when the fetch resolves", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({});

    const outcome = await probeReachable("https://postanki.ilya.online", {
      timeoutMs: 1000,
      fetchImpl,
    });

    expect(outcome).toEqual({ reachable: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://postanki.ilya.online",
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );
  });

  it("should report unreachable with a network message when the fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("failed to fetch"));

    const outcome = await probeReachable("https://postanki.ilya.online", {
      timeoutMs: 1000,
      fetchImpl,
    });

    expect(outcome).toEqual({ reachable: false, message: "Network unreachable." });
  });

  it("should report unreachable with a timeout message when the probe exceeds timeoutMs", async () => {
    const fetchImpl = vi.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    const outcome = await probeReachable("https://postanki.ilya.online", {
      timeoutMs: 5,
      fetchImpl,
    });

    expect(outcome).toEqual({ reachable: false, message: "Timed out reaching Post Anki." });
  });
});
