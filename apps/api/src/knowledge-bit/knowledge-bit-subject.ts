import { sql } from "drizzle-orm";
import { curricula, knowledgeSources } from "../db/schema.js";

// Single definition of a bit's deck: topic's curriculum subject, else its source's subject.
export const effectiveSubjectIdSql = sql<
  string | null
>`coalesce(${curricula.subjectId}, ${knowledgeSources.subjectId})`;
