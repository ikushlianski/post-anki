import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/client.js";
import { createOwnerUser } from "./create-user.js";

function fakeDb(inserted: { id: string }[]) {
  const values = vi.fn(() => ({
    onConflictDoNothing: () => ({ returning: async () => inserted }),
  }));
  const db = { insert: () => ({ values }) };

  return { db: db as unknown as Db, values };
}

describe("create owner user", () => {
  it("should store the email lower-cased and verified so the owner can sign in with any casing", async () => {
    const { db, values } = fakeDb([{ id: "user_1" }]);

    const result = await createOwnerUser(db, "  Owner@Example.COM ");

    expect(result).toEqual({ created: true, email: "owner@example.com" });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.com", emailVerified: true, name: "Owner" }));
  });

  it("should not create a second user when run again for the same email", async () => {
    const { db, values } = fakeDb([]);

    const result = await createOwnerUser(db, "owner@example.com");

    expect(result.created).toBe(false);
    expect(values).toHaveBeenCalledTimes(1);
  });
});
