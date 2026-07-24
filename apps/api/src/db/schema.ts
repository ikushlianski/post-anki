import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const subjects = pgTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  requireSources: boolean("require_sources").notNull().default(false),
  kind: text("kind").notNull().default("architecture-mentor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const curricula = pgTable("curricula", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  learningStatus: text("learning_status").notNull().default("not_started"),
  speed: text("speed").notNull().default("normal"),
  hinting: boolean("hinting").notNull().default(true),
  defaultDepth: text("default_depth").notNull().default("working"),
  strictOrder: boolean("strict_order").notNull().default(false),
  preAssessmentCompletedAt: timestamp("pre_assessment_completed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  title: text("title"),
  fetchedText: text("fetched_text"),
  approvalStatus: text("approval_status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modules = pgTable("modules", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  title: text("title").notNull(),
  order: integer("order").notNull(),
  priority: integer("priority").notNull().default(0),
  learningStatus: text("learning_status").notNull().default("not_started"),
  level: text("level"),
});

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  curriculumId: text("curriculum_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  order: integer("order").notNull(),
  priority: integer("priority").notNull().default(0),
  included: boolean("included").notNull().default(true),
  selfGrade: integer("self_grade"),
  depth: text("depth").notNull().default("working"),
  learningStatus: text("learning_status").notNull().default("not_started"),
  progressStatus: text("progress_status").notNull().default("not_started"),
  progressMaturity: integer("progress_maturity").notNull().default(0),
  progressAttempts: integer("progress_attempts").notNull().default(0),
  progressLastInteractedAt: timestamp("progress_last_interacted_at", {
    withTimezone: true,
  }),
});

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(),
  testToggle: boolean("test_toggle").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gaps = pgTable("gaps", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  label: text("label").notNull(),
  depth: text("depth").notNull().default("working"),
  origin: text("origin").notNull().default("ai"),
  state: text("state").notNull().default("open"),
  wanted: boolean("wanted").notNull().default(false),
  concern: text("concern"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
});

export const probeSessions = pgTable("probe_sessions", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  scopeId: text("scope_id").notNull(),
  curriculumId: text("curriculum_id"),
  status: text("status").notNull().default("active"),
  total: integer("total").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  answered: integer("answered").notNull().default(0),
  replenishing: boolean("replenishing").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const probeSessionQuestions = pgTable("probe_session_questions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  order: integer("order").notNull(),
  topicId: text("topic_id"),
  gapId: text("gap_id"),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctAnswerIndex: integer("correct_answer_index").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  kind: text("kind").notNull().default("mcq"),
  type: text("type").notNull().default("single"),
  correctAnswerIndexes: jsonb("correct_answer_indexes").$type<number[]>(),
  answeredIndex: integer("answered_index"),
  answeredIndexes: jsonb("answered_indexes").$type<number[]>(),
  outcome: text("outcome"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  optionExplanations: jsonb("option_explanations").$type<
    { text: string; citationUrl: string | null }[]
  >(),
});

export const socraticSessions = pgTable("socratic_sessions", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  curriculumId: text("curriculum_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const socraticTurns = pgTable("socratic_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  gapId: text("gap_id"),
  conceptLabel: text("concept_label").notNull(),
  order: integer("order").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer"),
  degree: text("degree"),
  action: text("action"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
});

export const nodeFeedback = pgTable("node_feedback", {
  id: text("id").primaryKey(),
  nodeType: text("node_type").notNull(),
  nodeId: text("node_id").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studyItemFeedback = pgTable(
  "study_item_feedback",
  {
    id: text("id").primaryKey(),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    topicId: text("topic_id"),
    itemText: text("item_text").notNull(),
    rating: text("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("study_item_feedback_item_unique").on(table.itemType, table.itemId)],
);

export const topicRecommendations = pgTable("topic_recommendations", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  text: text("text").notNull(),
  citations: jsonb("citations").$type<string[]>().notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
});

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tags_normalized_name_unique").on(table.normalizedName)],
);

export const tagAssignments = pgTable(
  "tag_assignments",
  {
    id: text("id").primaryKey(),
    tagId: text("tag_id").notNull(),
    nodeType: text("node_type").notNull(),
    nodeId: text("node_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tag_assignments_tag_node_unique").on(
      table.tagId,
      table.nodeType,
      table.nodeId,
    ),
  ],
);

// Mirrors `@post-anki/shared`'s `structureSnapshotSchema` shape (Phase 5
// draft-structure shaping). Kept as a locally-declared type here — not
// imported from the shared package — matching this file's existing
// convention of inline `$type<...>()` annotations for every other jsonb
// column (see `optionExplanations`/`citations` above); this is purely a
// TypeScript annotation for Drizzle, not a runtime validator.
interface StructureSnapshotJson {
  modules: {
    title: string;
    level: string;
    topics: { title: string; summary: string | null; suggestedDepth: string }[];
    tags: string[] | null;
  }[];
  strictOrder: boolean | null;
}

// A proposal recorded by the tool-calling structure editor's
// `suggestSplitIntoCourses` tool — proposal-only, mirrors
// `@post-anki/shared`'s `splitSuggestionSchema` shape (see that file's
// comment; kept as a local type here for the same reason as
// `StructureSnapshotJson` above).
interface SplitSuggestionJson {
  reason: string;
  groups: { courseName: string; moduleTitles: string[] }[];
}

export const curriculumStructureTurns = pgTable(
  "curriculum_structure_turns",
  {
    id: text("id").primaryKey(),
    curriculumId: text("curriculum_id").notNull(),
    role: text("role").notNull(),
    message: text("message").notNull(),
    structureSnapshot: jsonb("structure_snapshot").$type<StructureSnapshotJson>(),
    splitSuggestion: jsonb("split_suggestion").$type<SplitSuggestionJson>(),
    toolActions: jsonb("tool_actions").$type<string[]>(),
    // "pending" | "complete" | "failed" (see `@post-anki/shared`'s
    // `structureTurnStatusSchema`) — existing rows default to "complete" via
    // the migration's column default, since every turn written before this
    // column existed always represented a fully-resolved turn.
    status: text("status").notNull().default("complete"),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one pending assistant turn per curriculum at a time — the
    // real DB-level guarantee behind `submitStructureTurn`'s concurrency
    // guard. A check-then-act read in application code can't close this
    // race (two concurrent requests can both observe "no pending turn"),
    // so the constraint itself is what makes a second concurrent turn for
    // the same curriculum fail atomically on insert.
    uniqueIndex("curriculum_structure_turns_pending_assistant_unique")
      .on(table.curriculumId)
      .where(sql`${table.role} = 'assistant' AND ${table.status} = 'pending'`),
  ],
);

// One candidate row per URL surfaced by the SUPPLEMENTAL (research-gap-
// triggered) trusted-source search in a structure-shaping chat turn
// (Phase 5) — held here for explicit learner approval before ever reaching
// the structure-editor agent's prompt (see `curriculum-structure.ts`'s
// `submitStructureTurn`/`resolveSupplementalResearch`), the same
// approve/reject gate Phase 1's `sources` table applies to a course's
// original sources, just at a later stage and via its own table since this
// one triggers a mid-conversation edit rather than full curriculum
// generation. `structureTurnId` is nullable text, not a real FK, matching
// this schema's existing convention for cross-table text ids (e.g.
// `curriculum_structure_turns`'s own `curriculum_id` column) — it identifies
// which assistant turn surfaced the batch, but a row is never deleted
// alongside its turn.
export const structureResearchCandidates = pgTable("structure_research_candidates", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  structureTurnId: text("structure_turn_id"),
  label: text("label").notNull(),
  title: text("title").notNull(),
  value: text("value").notNull(),
  // "pending" | "approved" | "rejected" (see `@post-anki/shared`'s
  // `researchCandidateApprovalStatusSchema`) — mirrors `sources.approval_
  // status`'s shape, with `rejected` added since a removed candidate here is
  // recorded rather than deleted, unlike Phase 1's `deleteSource`.
  approvalStatus: text("approval_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per finished `generateWithRetry()` call in
// `curriculum-structure.ts` — written AFTER the whole retry sequence
// resolves or throws, never per-attempt (per-attempt detail already exists
// via `onFailedAttempt`'s pino log). `curriculumId` is nullable since not
// every future LLM call this table might record is curriculum-scoped, even
// though today's three call sites always pass one.
export const llmCallEvents = pgTable("llm_call_events", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id"),
  op: text("op").notNull(),
  agentKey: text("agent_key").notNull(),
  durationMs: integer("duration_ms").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userStreaks = pgTable("user_streaks", {
  id: text("id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"),
});
