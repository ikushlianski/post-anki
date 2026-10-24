import { describe, expect, it, vi } from "vitest";

import { fetchSubjects } from "./fetch-subjects.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchSubjects", () => {
  it("should list subjects from the API using the saved token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: "s1", name: "Claude exam", kind: "x" }, { nope: 1 }]));

    expect(await fetchSubjects("http://api", "tok", fetchImpl)).toEqual([{ id: "s1", name: "Claude exam" }]);
    expect(fetchImpl).toHaveBeenCalledWith("http://api/subjects", {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("should leave the dropdown empty when the API is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await fetchSubjects("http://api", "", fetchImpl)).toBeNull();
  });

  it("should leave the dropdown empty when the token is rejected", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401));

    expect(await fetchSubjects("http://api", "bad", fetchImpl)).toBeNull();
  });
});
