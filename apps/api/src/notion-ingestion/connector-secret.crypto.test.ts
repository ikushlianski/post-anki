import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./connector-secret.crypto.js";

const KEY = Buffer.alloc(32, 1).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 2).toString("base64");

describe("connector secret encryption", () => {
  it("should give back the saved token with the same key", () => {
    expect(decryptSecret(encryptSecret("secret_abc", KEY), KEY)).toBe("secret_abc");
  });

  it("should not store the token in readable form", () => {
    expect(encryptSecret("secret_abc", KEY)).not.toContain("secret_abc");
  });

  it("should refuse to decrypt with a different key", () => {
    expect(() => decryptSecret(encryptSecret("secret_abc", KEY), OTHER_KEY)).toThrow();
  });

  it("should produce a different ciphertext each time for the same token", () => {
    expect(encryptSecret("secret_abc", KEY)).not.toBe(encryptSecret("secret_abc", KEY));
  });

  it("should refuse a tampered ciphertext", () => {
    const parts = encryptSecret("secret_abc", KEY).split(":");

    parts[3] = Buffer.from("tampered").toString("base64");

    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow();
  });

  it("should refuse a key that is not 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.alloc(8).toString("base64"))).toThrow();
  });

  it("should refuse a shortened authentication tag", () => {
    const parts = encryptSecret("secret_abc", KEY).split(":");

    parts[2] = Buffer.from(parts[2] ?? "", "base64").subarray(0, 4).toString("base64");

    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow();
  });
});
