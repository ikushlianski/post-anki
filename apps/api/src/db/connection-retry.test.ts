import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetryingPool, isConnectionLevelError, retryOnceOnConnectionError } from "./connection-retry.js";

function pgError(code: string, message = "boom"): Error {
  return Object.assign(new Error(message), { code });
}

describe("retryOnceOnConnectionError", () => {
  it("should hide a Neon restart (57P01) from the caller by retrying the query once", async () => {
    const fn = vi.fn().mockRejectedValueOnce(pgError("57P01")).mockResolvedValueOnce("rows");

    await expect(retryOnceOnConnectionError(fn)).resolves.toBe("rows");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry after a reset socket", async () => {
    const fn = vi.fn().mockRejectedValueOnce(pgError("ECONNRESET")).mockResolvedValueOnce("rows");

    await expect(retryOnceOnConnectionError(fn)).resolves.toBe("rows");
  });

  it("should retry after a connection terminated unexpectedly", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValueOnce("rows");

    await expect(retryOnceOnConnectionError(fn)).resolves.toBe("rows");
  });

  it("should not retry a unique violation because the statement itself was rejected", async () => {
    const fn = vi.fn().mockRejectedValue(pgError("23505"));

    await expect(retryOnceOnConnectionError(fn)).rejects.toMatchObject({ code: "23505" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should surface the error when the connection fails a second time", async () => {
    const fn = vi.fn().mockRejectedValue(pgError("57P01"));

    await expect(retryOnceOnConnectionError(fn)).rejects.toMatchObject({ code: "57P01" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should not treat non-error values as connection failures", () => {
    expect(isConnectionLevelError(undefined)).toBe(false);
    expect(isConnectionLevelError("ECONNRESET")).toBe(false);
  });
});

describe("RetryingPool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should retry a plain pool query once after a dropped connection", async () => {
    const base = vi
      .spyOn(pg.Pool.prototype, "query")
      .mockRejectedValueOnce(pgError("57P01") as never)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pool = new RetryingPool({ connectionString: "postgres://u:p@localhost:5432/db" });

    await expect(pool.query("select 1")).resolves.toEqual({ rows: [{ id: 1 }] });
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("should leave connections checked out for a transaction unwrapped", async () => {
    const clientQuery = vi.fn().mockRejectedValue(pgError("57P01"));
    vi.spyOn(pg.Pool.prototype, "connect").mockResolvedValue({ query: clientQuery } as never);
    const pool = new RetryingPool({ connectionString: "postgres://u:p@localhost:5432/db" });
    const client = await pool.connect();

    await expect(client.query("update t set a = 1")).rejects.toMatchObject({ code: "57P01" });
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });
});
