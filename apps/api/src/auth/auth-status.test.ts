import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./auth.js", () => ({ getAuth: vi.fn() }));

const state = vi.hoisted(() => ({ secret: "a-long-enough-secret-value-123456" as string | undefined, owner: "owner@example.com" as string | undefined }));

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ BETTER_AUTH_SECRET: state.secret, OWNER_EMAIL: state.owner }),
}));

const { createWebSessionChecker, checkWebSession } = await import("./auth-status.js");
const { getAuth } = await import("./auth.js");

function checker(over: { configured?: boolean; session?: boolean }) {
  return createWebSessionChecker({
    isConfigured: () => over.configured ?? true,
    hasSession: async () => over.session ?? false,
  });
}

describe("web session status", () => {
  it("should report unconfigured when the auth secret or owner email is missing", async () => {
    expect(await checker({ configured: false, session: true })("c=1")).toBe("unconfigured");
  });

  it("should report signed_in for a valid session cookie", async () => {
    expect(await checker({ session: true })("c=1")).toBe("signed_in");
  });

  it("should report signed_out when the cookie has no valid session", async () => {
    expect(await checker({ session: false })("")).toBe("signed_out");
  });
});

describe("web session status from the environment", () => {
  function noSession() {
    vi.mocked(getAuth).mockReturnValue({ api: { getSession: async () => null } } as unknown as ReturnType<typeof getAuth>);
  }

  it("should report signed_out, not unconfigured, with the secret and owner email but no email provider key", async () => {
    noSession();
    state.secret = "a-long-enough-secret-value-123456";
    state.owner = "owner@example.com";

    expect(await checkWebSession("")).toBe("signed_out");
  });

  it("should report unconfigured when the owner email is missing", async () => {
    noSession();
    state.owner = undefined;

    expect(await checkWebSession("")).toBe("unconfigured");
  });

  it("should report unconfigured when the auth secret is missing", async () => {
    noSession();
    state.owner = "owner@example.com";
    state.secret = undefined;

    expect(await checkWebSession("")).toBe("unconfigured");
  });
});
