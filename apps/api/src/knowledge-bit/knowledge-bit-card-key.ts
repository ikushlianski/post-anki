import { INDEPENDENT_CARD_KINDS } from "@post-anki/shared";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { knowledgeBitQuestionVariants } from "../db/schema.js";

const independentKindsSql = sql.raw(INDEPENDENT_CARD_KINDS.map((kind) => `'${kind}'`).join(", "));

export const cardKeySql = (kind: SQLWrapper, order: SQLWrapper): SQL<string> =>
  sql<string>`case when ${kind} in (${independentKindsSql}) then ${kind} || ':' || ${order} else '' end`;

export const variantCardKeySql = cardKeySql(
  knowledgeBitQuestionVariants.kind,
  knowledgeBitQuestionVariants.order,
);
