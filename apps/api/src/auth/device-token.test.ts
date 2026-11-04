import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";

vi.mock("./auth.js", () => ({ CLIENT_IP_HEADER: "x-pa-client-ip", getAuth: vi.fn() }));

const { createDeviceToken } = await import("./device-token.js");
const { hashApiToken } = await import("../api-token/api-token.hash.js");

const input = { email: "owner@example.com", password: "correct horse battery", label: "Mac" };

function setup(signIn: Response) {
  const requests: Request[] = [];
  const insertToken = vi.fn(async () => ({ id: "apitoken_1", userId: "user_owner" }));
  const authHandler = vi.fn(async (request: Request) => {
    requests.push(request);

    return requests.length === 1 ? signIn : new Response("{}", { status: 200 });
  });

  return { requests, insertToken, deps: { authHandler, insertToken, baseUrl: "http://auth.test" } };
}

describe("device token minting", () => {
  it("should hand back a fresh pat token and store only its hash after the owner password checks out", async () => {
    const { deps, insertToken } = setup(new Response("{}", { status: 200, headers: { "set-auth-token": "sess" } }));

    const outcome = await createDeviceToken(input, "1.2.3.4", deps);

    expect(outcome.kind).toBe("created");

    const token = outcome.kind === "created" ? outcome.token : "";

    expect(token).toMatch(/^pat_[0-9a-f]{64}$/);
    expect(insertToken).toHaveBeenCalledWith({ label: "Mac", tokenHash: hashApiToken(token), ownerEmail: input.email });
  });

  it("should sign the sign-in session out again so no browser-style session lingers", async () => {
    const { deps, requests } = setup(new Response("{}", { status: 200, headers: { "set-auth-token": "sess" } }));

    await createDeviceToken(input, "1.2.3.4", deps);

    expect(requests[1]?.url).toBe("http://auth.test/api/auth/sign-out");
    expect(requests[1]?.headers.get("authorization")).toBe("Bearer sess");
    expect(requests[0]?.headers.get("x-pa-client-ip")).toBe("1.2.3.4");
  });

  it("should mint nothing when the password is wrong", async () => {
    const { deps, insertToken } = setup(new Response("{}", { status: 401 }));

    expect(await createDeviceToken(input, "1.2.3.4", deps)).toEqual({ kind: "invalid_credentials" });
    expect(insertToken).not.toHaveBeenCalled();
  });

  it("should report rate limiting with the retry hint and mint nothing", async () => {
    const { deps, insertToken } = setup(new Response("{}", { status: 429, headers: { "retry-after": "42" } }));

    expect(await createDeviceToken(input, "1.2.3.4", deps)).toEqual({ kind: "rate_limited", retryAfter: "42" });
    expect(insertToken).not.toHaveBeenCalled();
  });
});
