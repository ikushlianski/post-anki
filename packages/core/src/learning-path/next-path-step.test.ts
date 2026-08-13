import { describe, expect, it } from "vitest";
import { nextPathStep } from "./next-path-step";

describe("nextPathStep", () => {
  it("returns the first non-done step by stored order, never a mastery-ranked pick", () => {
    const next = nextPathStep([
      { domainNodeId: "step-1", status: "done" },
      { domainNodeId: "step-2", status: "done" },
      { domainNodeId: "step-3", status: "not_started" },
      { domainNodeId: "step-4", status: "in_progress" },
    ]);

    expect(next).toBe("step-3");
  });

  it("returns null once every step is done", () => {
    const next = nextPathStep([
      { domainNodeId: "step-1", status: "done" },
      { domainNodeId: "step-2", status: "done" },
    ]);

    expect(next).toBeNull();
  });

  it("returns null for an empty step list", () => {
    expect(nextPathStep([])).toBeNull();
  });

  it("treats an empty (not_started) step as the next step — content capture is the CTA, not a skip", () => {
    const next = nextPathStep([
      { domainNodeId: "step-1", status: "done" },
      { domainNodeId: "step-2", status: "not_started" },
    ]);

    expect(next).toBe("step-2");
  });
});
