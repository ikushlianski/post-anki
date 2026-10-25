import { describe, expect, it, vi } from "vitest";

vi.mock("./auth.js", () => ({ getAuth: vi.fn() }));

const { classifyCredential, isNativeAuthRoute } = await import("./api-credential.js");

describe("credential classification", () => {
  it("should recognise the shared secret before anything else", () => {
    expect(classifyCredential("Bearer s3cret", "s3cret")).toBe("shared_secret");
  });

  it("should recognise a device token by its pat_ prefix", () => {
    expect(classifyCredential("Bearer pat_abc", "s3cret")).toBe("device_token");
  });

  it("should treat any other bearer value as a session token", () => {
    expect(classifyCredential("Bearer abc.def", "s3cret")).toBe("session_token");
  });

  it("should report none for a missing, empty or non-bearer header", () => {
    expect(classifyCredential(undefined, "s3cret")).toBe("none");
    expect(classifyCredential("Bearer ", "s3cret")).toBe("none");
    expect(classifyCredential("Basic abc", "s3cret")).toBe("none");
  });

  it("should not treat a bearer value as the shared secret when none is configured", () => {
    expect(classifyCredential("Bearer undefined", undefined)).toBe("session_token");
  });
});

describe("native auth routes", () => {
  it("should open only password sign-in, sign-out and session lookup", () => {
    expect(isNativeAuthRoute("POST", "/api/auth/sign-in/email")).toBe(true);
    expect(isNativeAuthRoute("POST", "/api/auth/sign-out")).toBe(true);
    expect(isNativeAuthRoute("GET", "/api/auth/get-session")).toBe(true);
  });

  it("should keep key sign-in and every other auth path behind the shared secret", () => {
    expect(isNativeAuthRoute("POST", "/api/auth/sign-in/api-key")).toBe(false);
    expect(isNativeAuthRoute("POST", "/api/auth/sign-in/magic-link")).toBe(false);
    expect(isNativeAuthRoute("POST", "/api/auth/change-password")).toBe(false);
    expect(isNativeAuthRoute("GET", "/api/auth/sign-in/email")).toBe(false);
    expect(isNativeAuthRoute("GET", "/web-auth/checks")).toBe(false);
  });
});
