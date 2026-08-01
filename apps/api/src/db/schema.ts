import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/pg-core";

export const subjects = pgTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  requireSources: boolean("require_sources").notNull().default(false),
  kind: text("kind").notNull().default("architecture-mentor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ai-duplicate-detection (issue #63) — nullable, additive, no backfill:
  // every existing subject simply starts with no cached embedding, which
  // the first scan fills in. embeddingHash lets a scan skip re-embedding a
  // subject whose name+description text hasn't changed since it was last
  // embedded (the real cost bound, not just a subject-count cap — see
  // architecture.md's "Data model evolution").
  embedding: jsonb("embedding").$type<number[]>(),
  embeddingHash: text("embedding_hash"),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
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
  // Nullable, additive, one-directional link into domain_nodes below — the
  // relationship is discovered by querying curricula WHERE domain_node_id =
  // <id>, never stored redundantly on the node. No default, existing rows
  // stay null, zero data migration.
  domainNodeId: text("domain_node_id"),
});

// Self-referential tree, one forest per subject — sits between a subject and
// its curricula, reflecting the real shape of a domain independent of what's
// actually been studied. No .references() FK, matching this schema's
// dominant convention (plain text columns + app-level validation).
export const domainNodes = pgTable("domain_nodes", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // domain-priority-review (issue #52) — nullable, no default: "unset" is a
  // real, representable state (spec.md's Decisions #2). depthLevelSchema
  // ("awareness" | "working" | "deep"), app-level validated.
  targetDepth: text("target_depth"),
  // doc-changelog-scan (issue #49) — nullable, no default: a flag, never an
  // automatic percentage drop (spec.md's Decisions #2). Written only by
  // resolveDomainSupersessionSuggestion() on { status: "accepted" };
  // domainNodeProgress()/percent are completely untouched by either column.
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  supersededReason: text("superseded_reason"),
});

// One row per suggestion a domain-priority review run produces. No
// .references() FK, matching domain_nodes' own convention (plain text
// columns + app-level validation). `source` is the discriminator seam #49
// (doc-scan) and #53 (job-market-scan) plug their own producers into later.
export const domainPrioritySuggestions = pgTable(
  "domain_priority_suggestions",
  {
    id: text("id").primaryKey(),
    domainNodeId: text("domain_node_id").notNull(),
    subjectId: text("subject_id").notNull(),
    currentTargetDepth: text("current_target_depth"),
    suggestedTargetDepth: text("suggested_target_depth").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("general-knowledge"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  // getLastReviewedAt() runs WHERE subject_id = ? ORDER BY created_at DESC
  // LIMIT 1 on every review-status page load; rows are never deleted, so
  // without this it degrades into a growing per-subject scan-and-sort.
  (table) => [
    index("domain_priority_suggestions_subject_created_at_idx").on(
      table.subjectId,
      table.createdAt.desc(),
    ),
  ],
);

// doc-changelog-scan (issue #49) — one row per tracked tool
// (apps/api/src/domain-map/tracked-tools.ts's TRACKED_TOOLS constant), the
// "never a firehose" watermark. last_content_hash null = never successfully
// scanned. Only advanced by the orchestrator for a tool INCLUDED in a
// successful agent call (spec.md's Decisions #9) — a changed tool whose
// agent call then fails keeps its OLD hash so it's retried next run.
export const trackedToolScanState = pgTable("tracked_tool_scan_state", {
  toolKey: text("tool_key").primaryKey(),
  lastContentHash: text("last_content_hash"),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
});

// doc-changelog-scan (issue #49) — "propose a brand-new node" (the scan's
// (a) output). Neither this nor domain_supersession_suggestions below reuses
// domain_priority_suggestions (spec.md's Decisions #1: that row's
// domain_node_id is NOT NULL and its payload is suggested_target_depth,
// neither of which fits "no node id exists yet" or "flag, not a depth
// change"). Mirrors that table's pending|accepted|rejected + resolved_at +
// source shape as a pattern, not a literal shared row.
export const domainTopicSuggestions = pgTable("domain_topic_suggestions", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  // Nullable = attach at the subject root. Resolved to a real existing node
  // id AT SUGGESTION-CREATE TIME via domain-node-name-resolver.ts, never a
  // name re-resolved later (spec.md's Decisions #11).
  proposedParentNodeId: text("proposed_parent_node_id"),
  proposedNodeName: text("proposed_node_name").notNull(),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("doc-scan"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // Set to the newly inserted domain_nodes row's id on accept; null while
  // pending/rejected.
  createdDomainNodeId: text("created_domain_node_id"),
});

// doc-changelog-scan (issue #49) — "flag an existing node as possibly
// superseded" (the scan's (b) output). See domainTopicSuggestions' own
// comment above for why this is a sibling table, not a reuse.
export const domainSupersessionSuggestions = pgTable("domain_supersession_suggestions", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  domainNodeId: text("domain_node_id").notNull(),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("doc-scan"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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
  // Generalized recall-gap mastery tracking (issue #57) — the monotonic
  // per-topic counter mastery scheduling needs for probe-session quiz
  // answers, analogous to phrases.sequenceNumber's role for phrase-bank but
  // scoped to answered-question events per topic instead of
  // phrase-generation events per subject/level/pack. Incremented once per
  // answered probe-session question that touches a mastery-tracked gap on
  // this topic (see gap-mastery.repo.ts).
  gapMasterySequenceNumber: integer("gap_mastery_sequence_number").notNull().default(0),
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

// Generalized recall-gap mastery tracking (issue #57) — a SIDECAR to `gaps`,
// 1:1 via `gapId` (real unique index below), not new columns on `gaps`
// itself. This keeps `gaps.state`'s existing 3-value enum and its three
// pre-existing single-verdict writers (probe.service.ts, socratic.service.ts
// — including the give-up path — and probe-session.service.ts's own
// pre-existing single-verdict cover) completely untouched: none of them
// read or are gated by this table. Only probe-session.service.ts's
// answerProbeSession is rewritten to consult/write this table for gaps it
// touches, and becomes the sole writer allowed to flip `gaps.state` to
// "covered" for a mastery-tracked gap — and only once masteryStage reaches
// the mastery threshold. See docs/architecture/generalize-gap-tracking.md.
export const gapMastery = pgTable(
  "gap_mastery",
  {
    id: text("id").primaryKey(),
    gapId: text("gap_id").notNull(),
    status: text("status").notNull().default("new"),
    masteryStage: integer("mastery_stage").notNull().default(0),
    correctCountInCycle: integer("correct_count_in_cycle").notNull().default(0),
    incorrectCountInCycle: integer("incorrect_count_in_cycle").notNull().default(0),
    lastCorrectAtSequence: integer("last_correct_at_sequence"),
    scheduledForSequence: integer("scheduled_for_sequence"),
    // Plain text, references probe_sessions.id BY VALUE — no .references() FK,
    // matching this schema's dominant convention for cross-table ids (see
    // e.g. gaps.topicId, decideBlindSpots.decideSessionId above). This is
    // what proves "resurfaces in a later SESSION" (spec.md Decision 4) — a
    // correct answer only advances masteryStage when the CURRENT
    // probe_sessions.id differs from this stored value; a same-session
    // replenish repeat does not.
    lastCorrectSessionId: text("last_correct_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
  },
  (table) => [
    // Genuine DB-level 1:1 backstop, not just an app-level convention —
    // matches phrase_bank_entries' own unique-index precedent for its
    // concurrency guarantee (architecture.md's Concurrency design).
    uniqueIndex("gap_mastery_gap_id_unique").on(table.gapId),
  ],
);

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
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
  // Generalized recall-gap mastery tracking (issue #57) — persists the
  // AI-generated concept label even when it doesn't match an existing gap at
  // generation time (gapId stays null), so a miss on a never-before-seen
  // concept can still spawn a new gap at answer time (SCENARIO 2).
  gapLabel: text("gap_label"),
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

export const lectures = pgTable(
  "lectures",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("generating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("lectures_topic_id_unique").on(table.topicId)],
);

export const lectureSections = pgTable("lecture_sections", {
  id: text("id").primaryKey(),
  lectureId: text("lecture_id").notNull(),
  order: integer("order").notNull(),
  heading: text("heading").notNull(),
  body: text("body").notNull(),
});

export const lectureCitations = pgTable("lecture_citations", {
  id: text("id").primaryKey(),
  lectureId: text("lecture_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
});

export const lectureSourceCandidates = pgTable("lecture_source_candidates", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  whySelected: text("why_selected").notNull(),
  reviewStatus: text("review_status").notNull().default("pending"),
  fetchedText: text("fetched_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const languagePracticeSettings = pgTable("language_practice_settings", {
  subjectId: text("subject_id").primaryKey(),
  level: text("level").notNull().default("B1_B2"),
  pack: text("pack").notNull().default("General"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phrases = pgTable(
  "phrases",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    batchId: text("batch_id").notNull(),
    level: text("level").notNull(),
    pack: text("pack").notNull(),
    position: integer("position").notNull(),
    russian: text("russian").notNull(),
    referenceEnglish: text("reference_english").notNull(),
    domain: text("domain").notNull(),
    // References phraseBankEntries.id (declared below in this file — safe,
    // since drizzle resolves this callback lazily after the whole module has
    // loaded). ON DELETE SET NULL: nothing in the app deletes a
    // phrase_bank_entries row today (mastery archives via status:
    // "mastered", never a delete) — see architecture.md's "Migration"
    // section for the full reasoning.
    targetPhraseBankEntryId: text("target_phrase_bank_entry_id").references(
      (): typeof phraseBankEntries.id => phraseBankEntries.id,
      { onDelete: "set null" },
    ),
    sequenceNumber: integer("sequence_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // DB-level backstop for the nextSequenceBase race (SCENARIO 2 /
    // architecture.md race 1) — two concurrent batch-generation calls can no
    // longer land overlapping sequence numbers for the same
    // subject/level/pack scope, even if the advisory lock were ever bypassed.
    uniqueIndex("phrases_subject_level_pack_sequence_number_idx").on(
      table.subjectId,
      table.level,
      table.pack,
      table.sequenceNumber,
    ),
  ],
);

export const phraseBankEntries = pgTable(
  "phrase_bank_entries",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    level: text("level").notNull(),
    pack: text("pack").notNull(),
    phraseText: text("phrase_text").notNull(),
    category: text("category"),
    status: text("status").notNull().default("new"),
    masteryStage: integer("mastery_stage").notNull().default(0),
    correctCountInCycle: integer("correct_count_in_cycle").notNull().default(0),
    incorrectCountInCycle: integer("incorrect_count_in_cycle").notNull().default(0),
    lastCorrectAtSentenceCount: integer("last_correct_at_sentence_count"),
    lastCorrectDate: timestamp("last_correct_date", { withTimezone: true }),
    scheduledForSentenceCount: integer("scheduled_for_sentence_count"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
  },
  (table) => [
    // DB-level backstop for the linkOrCreateTargetPhrases race (SCENARIO 3 /
    // architecture.md race 2) — matches matchExistingPhraseBankEntry's
    // existing case-insensitive, TRIMMED comparison (normalizePhraseText:
    // text.trim().toLowerCase() in packages/core/src/phrase-bank/phrase-bank.ts).
    // architecture.md's own SQL sketch names only lower(phrase_text), but
    // scenarios.md SCENARIO 1's locked acceptance criteria explicitly
    // requires a whitespace-only variant ("get to the bottom of " with a
    // trailing space) to also collide — lower() alone would not catch that,
    // only lower(trim(...)) matches the app-level comparison this index is
    // meant to back up. Expression index; see architecture.md's "Migration"
    // section for the drizzle-kit-generation caveat.
    //
    // PARTIAL — excludes status = 'mastered', same pattern as
    // curriculum_structure_turns_pending_assistant_unique above.
    // matchExistingPhraseBankEntry itself excludes mastered candidates from
    // matching (phrase-bank.ts:61) — a mastered phrase re-encountered later
    // is meant to start a fresh entry, not collide with the mastered one. A
    // plain (non-partial) unique index here would 500 that request the
    // moment this migration landed, a regression an earlier, non-partial
    // draft of this index actually introduced and this project's own
    // integration test (phrase-bank-concurrency.integration.test.ts,
    // "a mastered entry's phrase text can be introduced again...") caught.
    uniqueIndex("phrase_bank_entries_subject_level_pack_phrase_text_idx")
      .on(table.subjectId, table.level, table.pack, sql`lower(trim(${table.phraseText}))`)
      .where(sql`${table.status} <> 'mastered'`),
  ],
);

export const phraseBankAppearances = pgTable("phrase_bank_appearances", {
  id: text("id").primaryKey(),
  phraseBankEntryId: text("phrase_bank_entry_id").notNull(),
  phraseId: text("phrase_id").notNull(),
  sentenceCount: integer("sentence_count").notNull(),
  result: text("result").notNull(),
  score: integer("score").notNull(),
  wasOverdue: boolean("was_overdue").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  phraseId: text("phrase_id").notNull(),
  userAnswer: text("user_answer").notNull(),
  score: integer("score").notNull(),
  verdict: text("verdict").notNull(),
  feedback: text("feedback").notNull(),
  nativeAlternatives: jsonb("native_alternatives").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per freeform "check my writing" submission (language-practice
// subjects only) — mirrors attempts' graded-result shape (score/verdict/
// feedback/nativeAlternatives) but carries the submitted `text` itself in
// place of attempts' phraseId + userAnswer, since there is no originating
// phrase to reference. No FK into subjects, matching every other
// language-practice table's existing convention (phrases/attempts/
// phraseBankEntries all carry a plain subjectId text column, no FK).
export const writingChecks = pgTable("writing_checks", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  text: text("text").notNull(),
  score: integer("score").notNull(),
  verdict: text("verdict").notNull(),
  feedback: text("feedback").notNull(),
  nativeAlternatives: jsonb("native_alternatives").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per /decide submission. Standalone — no subjectId/topicId column
// (spec.md's Decision #2: real architectural decisions are inherently
// cross-cutting, not tied to one subject's studied content; the shipped UI
// never had a subject picker). strengths/questions stay plain jsonb arrays
// (nothing asks them to be individually actionable, unlike blindSpots).
export const decideSessions = pgTable("decide_sessions", {
  id: text("id").primaryKey(),
  decision: text("decision").notNull(),
  opinion: text("opinion").notNull(),
  verdict: text("verdict").notNull(),
  strengths: jsonb("strengths").$type<string[]>().notNull(),
  questions: jsonb("questions").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per blind spot a decide session's mentor evaluation surfaces —
// individually actionable (status pending/accepted/rejected), modeled
// directly on the already-shipped domain_priority_suggestions
// accept/reject pattern (spec.md's Decision #1/#3). No .references() FK,
// matching this schema's dominant convention (plain text columns + app-level
// validation, e.g. writingChecks.subjectId above). `source` is the
// discriminator seam #57 (generalized gap-tracking) plugs into later.
export const decideBlindSpots = pgTable("decide_blind_spots", {
  id: text("id").primaryKey(),
  decideSessionId: text("decide_session_id").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("decide"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ontology-audit-trail (issue #62) — an append-only log of every "absorb
// source into target" merge across the four current merge functions
// (mergeSubjects/mergeTags/mergeCurricula/mergeDomainNodes). One row per
// successful merge, written inside that merge's own transaction (see
// ontology-merge.repo.ts's insertOntologyMergeLog). target_name/source_name
// are snapshots taken at merge time, not live joins — the source row is
// deleted by the merge itself, so a live join would 404 forever after.
// reassigned_counts is jsonb typed Record<string, number> rather than fixed
// columns — the four merges' count fields don't share a vocabulary
// (curriculaMoved/domainNodesMoved for subjects; assignmentsMoved/
// assignmentsDeduped/sessionsMoved for tags; modulesMoved/topicsMoved/
// sourcesMoved/socraticSessionsMoved/probeSessionsMoved for curricula;
// curriculaMoved/childNodesMoved for domain nodes) — mirrors this schema's
// existing typed-jsonb-for-varying-shape pattern (structureSnapshot,
// toolActions, nativeAlternatives). This is explicitly NOT the same
// mechanism as the still-open "make clearCurriculumStructure
// provenance-aware" wishlist item — see docs/architecture/
// ontology-audit-trail/architecture.md.
export const ontologyMerges = pgTable(
  "ontology_merges",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    targetId: text("target_id").notNull(),
    targetName: text("target_name").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    reassignedCounts: jsonb("reassigned_counts").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ontology_merges_created_at_idx").on(table.createdAt.desc())],
);

// ai-duplicate-detection (issue #63) — one row per candidate duplicate pair
// an embedding-similarity scan surfaces. Sibling in shape to
// domain_priority_suggestions/domain_topic_suggestions (source discriminator,
// status pending/accepted/rejected), plus a fourth status this feature
// introduces: "stale", for a pair invalidated by an unrelated merge/delete
// rather than resolved by a human (spec.md Decision #5) — kept distinct from
// "rejected" so a pair a human explicitly said "not a duplicate" to is never
// conflated with one that just became moot.
//
// subjectAId/subjectBId store an UNORDERED pair, but always in CANONICAL
// lexicographic order (subjectAId < subjectBId) — this is what lets the
// plain two-column partial unique index below enforce "at most one pending
// row per pair" regardless of which subject a caller names first (spec.md
// Decision #6).
export const subjectDuplicateSuggestions = pgTable(
  "subject_duplicate_suggestions",
  {
    id: text("id").primaryKey(),
    subjectAId: text("subject_a_id").notNull(),
    subjectBId: text("subject_b_id").notNull(),
    similarity: real("similarity").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("embedding-similarity"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // DB-level race guard, not just an app-level check-then-act guard
    // (red-team finding, mirrors curriculum_structure_turns_pending_
    // assistant_unique above) — a human double-clicking "Scan for
    // duplicates", or two browser tabs, can both observe "no pending row
    // yet" for the same pair before either insert commits. The constraint
    // itself is what makes the second concurrent insert fail atomically;
    // the repo catches that specific violation and treats it as a no-op.
    uniqueIndex("subject_duplicate_suggestions_pending_pair_unique")
      .on(table.subjectAId, table.subjectBId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
