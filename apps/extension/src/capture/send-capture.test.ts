import { describe, expect, it, vi } from "vitest";

import { sendCapture } from "./send-capture.js";

const settings = { baseUrl: "http://localhost:5560", token: "" };

function fetchReturning(status: number) {
  return vi.fn<typeof fetch>(async () => new Response(null, { status }));
}

describe("sendCapture", () => {
  it("should POST the text as JSON to /knowledge-sources without auth when no token is set", async () => {
    const fetchImpl = fetchReturning(201);

    const result = await sendCapture({ text: "hello" }, settings, fetchImpl);

    expect(result).toEqual({ ok: true });

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;

    expect(url).toBe("http://localhost:5560/knowledge-sources");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ text: "hello" });
    expect(init?.headers).not.toHaveProperty("Authorization");
  });

  it("should send link, title and subject in the JSON body", async () => {
    const fetchImpl = fetchReturning(201);
    const body = { text: "hello", sourceUrl: "https://example.com/", title: "T", subjectId: "s1" };

    await sendCapture(body, settings, fetchImpl);

    expect(JSON.parse(vi.mocked(fetchImpl).mock.calls[0]![1]?.body as string)).toEqual(body);
  });

  it("should send a Bearer header only when a token is configured", async () => {
    const fetchImpl = fetchReturning(201);

    await sendCapture({ text: "hello" }, { ...settings, token: "tok" }, fetchImpl);

    expect(vi.mocked(fetchImpl).mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: "Bearer tok",
    });
  });

  it.each([
    [400, "bad_request"],
    [401, "unauthorized"],
    [403, "forbidden"],
  ])("should report ok:false for HTTP %i", async (status, reason) => {
    expect(await sendCapture({ text: "hello" }, settings, fetchReturning(status))).toEqual({
      ok: false,
      reason,
    });
  });

  it("should report an already-added result, not a failure, for HTTP 409", async () => {
    expect(await sendCapture({ text: "hello" }, settings, fetchReturning(409))).toEqual({
      ok: false,
      reason: "already_added",
    });
  });

  it("should report ok:false instead of throwing when the network fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await sendCapture({ text: "hello" }, settings, fetchImpl)).toEqual({
      ok: false,
      reason: "network",
    });
  });
});
