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

  it("should stop counting users once an owner has been seen", async () => {
    const countUsers = vi.fn(async () => 1);
    const check = createWebSessionChecker({
      isConfigured: () => true,
      countUsers,
      hasSession: async () => true,
    });

    await check("c=1");
    await check("c=1");

    expect(countUsers).toHaveBeenCalledTimes(1);
  });

  it("should keep checking for an owner until one is created", async () => {
    const countUsers = vi.fn<() => Promise<number>>().mockResolvedValueOnce(0).mockResolvedValue(1);
    const check = createWebSessionChecker({
      isConfigured: () => true,
      countUsers,
      hasSession: async () => true,
    });

    expect(await check("c=1")).toBe("unconfigured");
    expect(await check("c=1")).toBe("signed_in");
  });
});
