import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("../auth/auth.js", () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock("../shared/env.js", () => ({ loadEnv: () => ({ API_SHARED_SECRET: "shared-secret" }) }));

import { resolveCurrentSession } from "./account.session.js";

function req(headers: Record<string, string>): http.IncomingMessage {
  return { headers } as http.IncomingMessage;
}

beforeEach(() => {
  getSession.mockReset();
});

describe("resolveCurrentSession", () => {
  it("should identify the user from the browser cookie", async () => {
    getSession.mockResolvedValue({
      user: { id: "u1" },
      session: { id: "s1", createdAt: "2026-03-01T10:00:00Z" },
    });

    const result = await resolveCurrentSession(req({ cookie: "better-auth.session_token=abc", authorization: "Bearer shared-secret" }));

    expect(result).toEqual({ userId: "u1", sessionId: "s1", sessionCreatedAt: new Date("2026-03-01T10:00:00Z") });

    const headers = getSession.mock.calls[0]?.[0].headers as Headers;

    expect(headers.get("cookie")).toBe("better-auth.session_token=abc");
    expect(headers.get("authorization")).toBeNull();
  });

  it("should not treat the shared secret alone as a signed-in user", async () => {
    getSession.mockResolvedValue(null);

    expect(await resolveCurrentSession(req({ authorization: "Bearer shared-secret" }))).toBeNull();
  });

  it("should return null when the session lookup fails", async () => {
    getSession.mockRejectedValue(new Error("boom"));

    expect(await resolveCurrentSession(req({ cookie: "x=y" }))).toBeNull();
  });
});
