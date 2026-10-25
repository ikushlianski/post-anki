import { and, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import {
  browserDateBoundInstant,
  KNOWLEDGE_BIT_BROWSER_NO_SUBJECT,
  type KnowledgeBitBrowserAddedBy,
  type KnowledgeBitBrowserFilters,
  type KnowledgeBitBrowserOrigin,
  type KnowledgeBitOverviewState,
} from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitSchedules, knowledgeSources } from "../db/schema.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { answerContains, containsPattern, questionContains } from "./knowledge-bit-text-match.js";

export const sourceTypeSql = sql<KnowledgeBitBrowserOrigin>`case
  when ${knowledgeBits.origin} = 'manual' then 'manual'
  when ${knowledgeBits.isAiGenerated} then 'ai_web'
  when nullif(${knowledgeSources.sourceUrl}, '') is not null then 'article'
  when ${knowledgeSources.kind} = 'notion' then 'notion'
  else 'pasted'
end`;

export const addedBySql = sql<KnowledgeBitBrowserAddedBy>`case when ${sourceTypeSql} = 'ai_web' then 'ai' else 'you' end`;

export function studyStateSql(now: Date) {
  return sql<KnowledgeBitOverviewState>`case
    when ${knowledgeBitSchedules.knowledgeBitId} is null then 'new'
    when ${knowledgeBitSchedules.suspendedAt} is not null then 'suspended'
    when ${knowledgeBitSchedules.buriedUntil} > ${now.toISOString()}::timestamptz then 'buried'
    when ${knowledgeBitSchedules.phase} in ('new', 'learning', 'review', 'relearning') then ${knowledgeBitSchedules.phase}
    else 'review'
  end`;
}

const sourceHostSql = sql`regexp_replace(lower(substring(${knowledgeSources.sourceUrl} from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)')), '^www\\.', '')`;

function hasLinkSql() {
  return sql`nullif(${knowledgeSources.sourceUrl}, '') is not null`;
}

function siteSql(site: string) {
  return sql`(${sourceHostSql} = ${site} or right(${sourceHostSql}, ${site.length + 1}) = ${`.${site}`})`;
}

export interface BrowserFilterContext {
  db: DbExecutor;
  now: Date;
  subjectScopeIds: string[] | null;
  subjectId?: string;
}

export function buildBrowserFilterCondition(
  filters: KnowledgeBitBrowserFilters,
  { db, now, subjectScopeIds, subjectId }: BrowserFilterContext,
): SQL | undefined {
  return and(
    subjectScopeIds ? inArray(effectiveSubjectIdSql, subjectScopeIds) : undefined,
    subjectId === KNOWLEDGE_BIT_BROWSER_NO_SUBJECT ? isNull(effectiveSubjectIdSql) : undefined,
    filters.question ? questionContains(containsPattern(filters.question), db) : undefined,
    filters.answer ? answerContains(containsPattern(filters.answer), db) : undefined,
    filters.origins?.length ? inArray(sourceTypeSql, filters.origins) : undefined,
    filters.addedBy?.length ? inArray(addedBySql, filters.addedBy) : undefined,
    filters.link === "has" ? hasLinkSql() : undefined,
    filters.link === "none" ? sql`not (${hasLinkSql()})` : undefined,
    filters.site ? siteSql(filters.site) : undefined,
    filters.from ? gte(knowledgeBits.createdAt, browserDateBoundInstant(filters.from, "start")) : undefined,
    filters.to ? lte(knowledgeBits.createdAt, browserDateBoundInstant(filters.to, "end")) : undefined,
    filters.states?.length ? inArray(studyStateSql(now), filters.states) : undefined,
  );
}
