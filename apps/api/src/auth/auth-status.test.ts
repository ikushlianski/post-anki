import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./auth.js", () => ({ getAuth: vi.fn() }));

const { createWebSessionChecker } = await import("./auth-status.js");

function checker(over: { configured?: boolean; users?: number; session?: boolean }) {
  return createWebSessionChecker({
    isConfigured: () => over.configured ?? true,
    countUsers: async () => over.users ?? 1,
    hasSession: async () => over.session ?? false,
  });
}

describe("web session status", () => {
  it("should report unconfigured when email delivery is not set up", async () => {
    expect(await checker({ configured: false, session: true })("c=1")).toBe("unconfigured");
  });

  it("should report unconfigured when no owner exists yet", async () => {
    expect(await checker({ users: 0, session: true })("c=1")).toBe("unconfigured");
  });

  it("should report signed_in for a valid session cookie", async () => {
    expect(await checker({ session: true })("c=1")).toBe("signed_in");
  });

  it("should report signed_out when the cookie has no valid session", async () => {
    expect(await checker({ session: false })("")).toBe("signed_out");
  });
});
