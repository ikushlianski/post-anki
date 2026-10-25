import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/client.js";
import { loadEnv } from "../shared/env.js";
import { ensureOwnerUser, getOwnerEmail, isOwnerEmail } from "./owner-user.js";

vi.mock("../shared/env.js", () => ({ loadEnv: vi.fn() }));

function setOwnerEmail(email: string | undefined) {
  vi.mocked(loadEnv).mockReturnValue({ OWNER_EMAIL: email } as ReturnType<typeof loadEnv>);
}

function fakeDb() {
  const rows = new Map<string, string>();
  const db = {
    insert: () => ({
      values: (row: { id: string; email: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (rows.has(row.email)) {
              return [];
            }

            rows.set(row.email, row.id);

            return [{ id: row.id }];
          },
        }),
      }),
    }),
  };

  return { db: db as unknown as Db, rows };
}

beforeEach(() => {
  setOwnerEmail("Owner@Example.com");
});

describe("owner identity", () => {
  it("should read the configured owner email lower-cased and trimmed", () => {
    setOwnerEmail("  Owner@Example.com ");

    expect(getOwnerEmail()).toBe("owner@example.com");
  });

  it("should report no owner when the setting is missing", () => {
    setOwnerEmail(undefined);

    expect(getOwnerEmail()).toBeUndefined();
  });

  it("should recognise the owner whatever the casing or surrounding spaces", () => {
    expect(isOwnerEmail("  OWNER@example.COM  ")).toBe(true);
  });

  it("should never treat a different email as the owner", () => {
    expect(isOwnerEmail("stranger@example.com")).toBe(false);
    expect(isOwnerEmail("owner@example.com.evil.io")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("should treat nobody as the owner when no owner email is configured", () => {
    setOwnerEmail(undefined);

    expect(isOwnerEmail("owner@example.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("should create exactly one owner user when ensured twice", async () => {
    const { db, rows } = fakeDb();

    const first = await ensureOwnerUser(db);
    const second = await ensureOwnerUser(db);

    expect(first).toEqual({ created: true, email: "owner@example.com" });
    expect(second).toEqual({ created: false, email: "owner@example.com" });
    expect(rows.size).toBe(1);
  });

  it("should refuse to create a user when no owner email is configured", async () => {
    setOwnerEmail(undefined);
    const { db, rows } = fakeDb();

    await expect(ensureOwnerUser(db)).rejects.toThrow("owner email");
    expect(rows.size).toBe(0);
  });
});
