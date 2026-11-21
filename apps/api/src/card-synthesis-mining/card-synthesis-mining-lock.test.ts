import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const client = { query: vi.fn(), release: vi.fn() };

vi.mock("../db/client.js", () => ({
  getDb: () => ({ $client: { connect: async () => client } }),
}));

import { withMiningRunLock } from "./card-synthesis-mining-lock.js";

beforeEach(() => {
  client.query.mockReset();
  client.release.mockReset();
});

describe("withMiningRunLock", () => {
  it("should run the job and release the lock when no other run holds it", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [] });
    const run = vi.fn().mockResolvedValue("done");

    const result = await withMiningRunLock(run);

    expect(result).toEqual({ acquired: true, value: "done" });
    expect(client.query.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it("should not run the job when another run already holds the lock", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    const run = vi.fn();

    const result = await withMiningRunLock(run);

    expect(result).toEqual({ acquired: false });
    expect(run).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it("should release the lock even when the job throws", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ locked: true }] }).mockResolvedValueOnce({ rows: [] });

    await expect(withMiningRunLock(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");

    expect(client.query.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
  });

  it("should drop the connection when the unlock fails so the lock cannot leak", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(new Error("conn lost"));

    await withMiningRunLock(async () => "ok");

    expect(client.release).toHaveBeenCalledWith(true);
  });
});
