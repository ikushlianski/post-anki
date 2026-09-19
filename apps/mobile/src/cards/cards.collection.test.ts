import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));

vi.mock("../api/token-storage", () => ({
  getStoredToken: vi.fn(),
}));

import { getStoredToken } from "../api/token-storage";
import { authorizationHeader } from "./cards.collection";

const mockedGetStoredToken = vi.mocked(getStoredToken);

describe("authorizationHeader", () => {
  afterEach(() => {
    mockedGetStoredToken.mockReset();
  });

  it("attaches the stored token as a bearer header when one exists", async () => {
    mockedGetStoredToken.mockResolvedValue("pat_abc123");

    await expect(authorizationHeader()).resolves.toBe("Bearer pat_abc123");
  });

  it("sends an empty header when no token is stored yet", async () => {
    mockedGetStoredToken.mockResolvedValue(null);

    await expect(authorizationHeader()).resolves.toBe("");
  });
});
