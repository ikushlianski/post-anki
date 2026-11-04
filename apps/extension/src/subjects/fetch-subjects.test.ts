import { describe, expect, it, vi } from "vitest";

import { fetchSubjects } from "./fetch-subjects.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchSubjects", () => {
  it("should list subjects from the API using the saved token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: "s1", name: "Claude exam", kind: "x" }, { nope: 1 }]));

    expect(await fetchSubjects("http://api", "tok", fetchImpl)).toEqual({
      ok: true,
      subjects: [{ id: "s1", name: "Claude exam" }],
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://api/subjects", {
      headers: { Authorization: "Bearer tok" },
      signal: expect.any(AbortSignal),
    });
  });

  it("should report network when the API is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await fetchSubjects("http://api", "", fetchImpl)).toEqual({ ok: false, reason: "network" });
  });

  it("should report unauthorized when the token is rejected", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401));

    expect(await fetchSubjects("http://api", "bad", fetchImpl)).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("should report forbidden when the extension id is not allowed", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "forbidden" }, 403));

    expect(await fetchSubjects("http://api", "", fetchImpl)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("should report other with the status for any other failing status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 502));

    expect(await fetchSubjects("http://api", "", fetchImpl)).toEqual({ ok: false, reason: "other", status: 502 });
  });

  it("should report other when the body is not a list", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }));

    expect(await fetchSubjects("http://api", "", fetchImpl)).toEqual({ ok: false, reason: "other", status: 200 });
  });
});

describe("fetchSubjects timeout", () => {
  it("should report network when the server never answers", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) reject(new Error("aborted"));
        }),
    );

    expect(await fetchSubjects("http://localhost:5560", "", fetchImpl)).toEqual({
      ok: false,
      reason: "network",
    });
    expect(timeout).toHaveBeenCalledWith(15_000);
    timeout.mockRestore();
  });
});
