import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { releaseRejectionFeedback } from "./knowledge-bit-feedback-restore.repo.js";

const dialect = new PgDialect();

interface Row {
  id: string;
  verdict: string;
  reasonCode: string | null;
  rating: number | null;
  wordingRating: number | null;
  note: string | null;
}

function fakeDb(rows: Row[]) {
  const matchesRejected = (row: Row) => row.verdict === "rejected";
  const hasGrade = (row: Row) => row.rating !== null || row.wordingRating !== null || row.note !== null;

  const db = {
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: (clause: SQL) => {
          const sql = dialect.sqlToQuery(clause).sql;
          expect(sql).toContain("is not null");

          for (const row of rows) {
            if (matchesRejected(row) && hasGrade(row)) {
              Object.assign(row, patch);
            }
          }

          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: (clause: SQL) => {
        const sql = dialect.sqlToQuery(clause).sql;
        expect(sql).toContain("is null");

        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];

          if (row && matchesRejected(row) && !hasGrade(row)) {
            rows.splice(i, 1);
          }
        }

        return Promise.resolve();
      },
    }),
  } as unknown as DbExecutor;

  return db;
}

describe("releaseRejectionFeedback", () => {
  it("should keep a graded card's rating and note as a pending row when its rejection is undone", async () => {
    const rows: Row[] = [
      { id: "kbf_1", verdict: "rejected", reasonCode: "unspecified", rating: 4, wordingRating: null, note: "clear" },
    ];

    await releaseRejectionFeedback(fakeDb(rows), "kb_1");

    expect(rows).toEqual([
      { id: "kbf_1", verdict: "pending", reasonCode: null, rating: 4, wordingRating: null, note: "clear" },
    ]);
  });

  it("should still delete the rejection row of an ungraded card when its rejection is undone", async () => {
    const rows: Row[] = [
      { id: "kbf_1", verdict: "rejected", reasonCode: "unspecified", rating: null, wordingRating: null, note: null },
    ];

    await releaseRejectionFeedback(fakeDb(rows), "kb_1");

    expect(rows).toEqual([]);
  });
});
