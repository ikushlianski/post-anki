import { sql } from "drizzle-orm";
import { knowledgeBitFeedback, knowledgeBits } from "../db/schema.js";

export const excludeManualBitFeedback = sql`not exists (
  select 1 from ${knowledgeBits}
  where ${knowledgeBits.id} = ${knowledgeBitFeedback.knowledgeBitId}
    and ${knowledgeBits.origin} = 'manual'
)`;

export class GradesNotApplicableError extends Error {
  constructor() {
    super("grades_not_applicable");
  }
}
