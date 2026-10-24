import { describe, expect, it } from "vitest";
import { resolveRoute } from "../router.js";

describe("card triage routes", () => {
  it("should route the session lifecycle and the notes endpoints", () => {
    expect(resolveRoute("POST", "/triage-sessions")?.name).toBe("startTriageSession");
    expect(resolveRoute("GET", "/triage-sessions/cts_1")).toEqual({ name: "getTriageSession", params: { id: "cts_1" } });
    expect(resolveRoute("POST", "/triage-sessions/cts_1/finish")).toEqual({
      name: "finishTriageSession",
      params: { id: "cts_1" },
    });
    expect(resolveRoute("POST", "/triage-sessions/cts_1/distill")).toEqual({
      name: "distillTriageSession",
      params: { id: "cts_1" },
    });
    expect(resolveRoute("GET", "/card-style-notes")?.name).toBe("listCardStyleNotes");
    expect(resolveRoute("PATCH", "/card-style-notes/csn_1")).toEqual({
      name: "updateCardStyleNote",
      params: { id: "csn_1" },
    });
  });
});
