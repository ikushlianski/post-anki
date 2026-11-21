import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { findSourcesByNormalizedText } from "./knowledge-source-keyed-insert.repo.js";

function capturingDb(): { db: DbExecutor; where: () => SQL } {
  let captured: SQL | undefined;
  const chain = {
    from: () => chain,
    where: (condition: SQL) => {
      captured = condition;

      return Promise.resolve([]);
    },
  };
  const db = { select: () => chain } as unknown as DbExecutor;

  return {
    db,
    where: () => {
      if (!captured) {
        throw new Error("no where captured");
      }

      return captured;
    },
  };
}

describe("findSourcesByNormalizedText", () => {
  it("should not treat failed or nothing-extracted sources as duplicates so the note is filed fresh and can get cards", async () => {
    const { db, where } = capturingDb();

    await findSourcesByNormalizedText("subject-1", ["circle back"], db);
    const query = new PgDialect().sqlToQuery(where());

    expect(query.sql).toContain('"status" not in');
    expect(query.params).toEqual(expect.arrayContaining(["failed", "nothing_extracted", "subject-1", "circle back"]));
  });
});
