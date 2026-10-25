import { describe, expect, it } from "vitest";
import { resetApprovedBitsToPending, type SqlClient } from "./reset-approved-bits-to-pending.js";

const LOCAL_URL = "postgres://user:pw@localhost:5578/postanki";
const REMOTE_URL = "postgres://user:pw@db.example.neon.tech/postanki";

function createFakeClient(states: string[], processedSources: string[] = ["s1"]) {
  const bits = states.map((state, i) => ({ id: `b${i}`, state, source: `s${i}` }));
  const sources = new Set(processedSources);
  const statements: string[] = [];

  const client: SqlClient = {
    async query(text) {
      statements.push(text);

      if (text.startsWith("SELECT approval_state")) {
        const counts = new Map<string, number>();

        for (const bit of bits) {
          counts.set(bit.state, (counts.get(bit.state) ?? 0) + 1);
        }

        return { rows: [...counts].map(([approval_state, n]) => ({ approval_state, n })) };
      }

      if (text.includes("UPDATE knowledge_sources")) {
        const approvedSources = new Set(bits.filter((b) => b.state === "approved").map((b) => b.source));
        const hit = [...sources].filter((id) => approvedSources.has(id));

        hit.forEach((id) => sources.delete(id));

        return { rows: hit.map((id) => ({ id })) };
      }

      if (text.includes("UPDATE knowledge_bits")) {
        const hit = bits.filter((b) => b.state === "approved");

        hit.forEach((b) => {
          b.state = "pending";
        });

        return { rows: hit.map((b) => ({ id: b.id })) };
      }

      return { rows: [] };
    },
  };

  return { client, bits, statements };
}

describe("resetApprovedBitsToPending", () => {
  it("should refuse a non-local host and run no SQL", async () => {
    const { client, statements } = createFakeClient(["approved"]);

    await expect(resetApprovedBitsToPending(client, REMOTE_URL)).rejects.toThrow(/non-local database host/);
    expect(statements).toEqual([]);
  });

  it("should refuse a remote host even when the remote-confirm override is set", async () => {
    const { client, statements } = createFakeClient(["approved"]);

    process.env.ALLOW_REMOTE_DB_MIGRATE = "1";

    try {
      await expect(resetApprovedBitsToPending(client, REMOTE_URL)).rejects.toThrow(/non-local database host/);
      expect(statements).toEqual([]);
    } finally {
      delete process.env.ALLOW_REMOTE_DB_MIGRATE;
    }
  });

  it("should move only approved cards to pending and leave rejected and superseded alone", async () => {
    const { client, bits } = createFakeClient(["approved", "approved", "rejected", "superseded", "pending"]);

    const summary = await resetApprovedBitsToPending(client, LOCAL_URL);

    expect(bits.map((b) => b.state)).toEqual(["pending", "pending", "rejected", "superseded", "pending"]);
    expect(summary).toMatchObject({
      host: "localhost",
      database: "postanki",
      bitsReset: 2,
      before: { approved: 2, rejected: 1, superseded: 1, pending: 1 },
      after: { pending: 3, rejected: 1, superseded: 1 },
    });
  });

  it("should reopen processed sources so reset cards reappear in pending review", async () => {
    const { client } = createFakeClient(["approved"], ["s0"]);

    const summary = await resetApprovedBitsToPending(client, LOCAL_URL);

    expect(summary.sourcesReopened).toBe(1);
  });

  it("should change nothing when run a second time", async () => {
    const { client, bits } = createFakeClient(["approved", "rejected"]);

    await resetApprovedBitsToPending(client, LOCAL_URL);

    const second = await resetApprovedBitsToPending(client, LOCAL_URL);

    expect(second.bitsReset).toBe(0);
    expect(second.sourcesReopened).toBe(0);
    expect(second.before).toEqual(second.after);
    expect(bits.map((b) => b.state)).toEqual(["pending", "rejected"]);
  });
});
