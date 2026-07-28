import { describe, it, expect } from "vitest";
import { resolveNodePathByName } from "./domain-node-name-resolver.js";

const NODES = [
  { id: "n_frontend", parentId: null, name: "Frontend" },
  { id: "n_meta", parentId: "n_frontend", name: "Meta-frameworks" },
  { id: "n_nextjs", parentId: "n_meta", name: "Next.js" },
];

describe("resolveNodePathByName", () => {
  it("returns null/not-fully-resolved for a null or empty path", () => {
    expect(resolveNodePathByName(NODES, null)).toEqual({ nodeId: null, fullyResolved: false });
    expect(resolveNodePathByName(NODES, [])).toEqual({ nodeId: null, fullyResolved: false });
  });

  it("skips a non-matching first segment as the agent's generic root marker", () => {
    const result = resolveNodePathByName(NODES, ["root", "Frontend", "Meta-frameworks"]);
    expect(result).toEqual({ nodeId: "n_meta", fullyResolved: true });
  });

  it("matches case-insensitively and resolves the full path to a leaf", () => {
    const result = resolveNodePathByName(NODES, ["root", "frontend", "meta-frameworks", "next.js"]);
    expect(result).toEqual({ nodeId: "n_nextjs", fullyResolved: true });
  });

  it("falls back to the last resolved ancestor and marks fullyResolved false on an unmatched later segment", () => {
    const result = resolveNodePathByName(NODES, ["root", "Frontend", "NoSuchChild"]);
    expect(result).toEqual({ nodeId: "n_frontend", fullyResolved: false });
  });

  it("treats a coincidentally-matching first segment as a real match, not a skipped marker", () => {
    const result = resolveNodePathByName(NODES, ["Frontend", "Meta-frameworks"]);
    expect(result).toEqual({ nodeId: "n_meta", fullyResolved: true });
  });

  it("returns null/not-fully-resolved when even the first real segment fails to match", () => {
    const result = resolveNodePathByName(NODES, ["root", "NoSuchArea"]);
    expect(result).toEqual({ nodeId: null, fullyResolved: false });
  });
});
