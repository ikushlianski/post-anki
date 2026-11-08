import { describe, expect, it } from "vitest";
import { createBatchSession } from "./batch-session.js";

describe("createBatchSession", () => {
  it("should refuse an id it never handed out", () => {
    expect(createBatchSession().confirm("nope")).toEqual({ ok: false, reason: "unknown" });
  });

  it("should refuse a batch confirmed a second time", () => {
    const session = createBatchSession();
    const id = session.open(["a", "b"]);

    expect(session.confirm(id)).toEqual({ ok: true, hashes: ["a", "b"] });
    expect(session.confirm(id)).toEqual({ ok: false, reason: "already-confirmed" });
  });

  it("should exclude open hashes from the next batch until confirmed", () => {
    const session = createBatchSession();
    const id = session.open(["a"]);

    expect(session.openHashes()).toEqual(new Set(["a"]));
    expect(session.pendingCount()).toBe(1);
    session.confirm(id);
    expect(session.openHashes().size).toBe(0);
    expect(session.pendingCount()).toBe(0);
  });
});
