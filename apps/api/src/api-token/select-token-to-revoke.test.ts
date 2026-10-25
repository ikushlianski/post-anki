import { describe, expect, it } from "vitest";
import { selectTokenToRevoke, type RevocableToken } from "./select-token-to-revoke.js";

const phone: RevocableToken = { id: "apitoken_1", label: "Phone", revokedAt: null };
const web: RevocableToken = { id: "apitoken_2", label: "web", revokedAt: null };
const oldWeb: RevocableToken = { id: "apitoken_3", label: "web", revokedAt: new Date("2026-01-01") };

describe("choosing which key to revoke", () => {
  it("should pick a key by its id", () => {
    expect(selectTokenToRevoke([phone, web], "apitoken_2")).toEqual({ ok: true, token: web });
  });

  it("should pick a key by its label", () => {
    expect(selectTokenToRevoke([phone, web], "Phone")).toEqual({ ok: true, token: phone });
  });

  it("should ignore already revoked keys that share the label", () => {
    expect(selectTokenToRevoke([oldWeb, web], "web")).toEqual({ ok: true, token: web });
  });

  it("should refuse a label shared by several active keys so the wrong device is not cut off", () => {
    const second: RevocableToken = { id: "apitoken_4", label: "web", revokedAt: null };

    expect(selectTokenToRevoke([web, second], "web")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("should report an unknown selector and an already revoked key", () => {
    expect(selectTokenToRevoke([phone], "nope")).toEqual({ ok: false, reason: "not_found" });
    expect(selectTokenToRevoke([oldWeb], "apitoken_3")).toEqual({ ok: false, reason: "already_revoked" });
  });
});
