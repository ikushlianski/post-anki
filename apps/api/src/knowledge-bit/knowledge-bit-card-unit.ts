import { and, eq, exists, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitCards, knowledgeBitSchedules } from "../db/schema.js";

export const scheduleIsActiveCard = (db: DbExecutor) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(knowledgeBitCards)
      .where(
        and(
          eq(knowledgeBitCards.knowledgeBitId, knowledgeBitSchedules.knowledgeBitId),
          eq(knowledgeBitCards.cardKey, knowledgeBitSchedules.cardKey),
        ),
      ),
  );
