import { sql } from "drizzle-orm";
import { knowledgeSources } from "../db/schema.js";

export const knowledgeSourceTitleSql = sql<string | null>`nullif(left(btrim(split_part(btrim(${knowledgeSources.rawText}, E' \\n\\r\\t'), E'\\n', 1), E' \\r\\t'), 120), '')`;
