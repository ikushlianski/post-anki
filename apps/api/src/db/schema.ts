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
  primaryKey,
  customType,
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

export const curricula = pgTable(
  "curricula",
  {
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
    // learning-list-intake — nullable, no default: a curriculum that is not
    // cross-cutting simply has no concern, exactly as gaps.concern already
    // models it. Same 6-value `concernSchema` from @post-anki/shared,
    // app-level validated — deliberately NOT a pg enum, matching every other
    // enum-ish text column in this file.
    concern: text("concern"),
    // learning-list-fold-in — nullable, additive: marks a curriculum as the
    // implicit, single, per-Area catch-all container that a folded-in single
    // (learning-list destination `fold_in`) lands in, since `topics.
    // curriculum_id` is NOT NULL but folding an article in must never spawn a
    // course the learner has to browse or finish. NULL for every ordinary
    // curriculum — this is the ONLY thing that marks a curriculum as a
    // container; nothing else does. Holds the `domain_nodes.id` of the Area
    // (`domain_nodes.kind = 'area'`) it backs, at most one container per
    // (subject, Area) — see curricula_container_area_node_id_unique below.
    // Written and read by findOrCreateAreaContainer (learning-list/
    // area-container.repo.ts); every curricula listing read path filters
    // this non-null so the container never shows up as a course to browse.
    containerAreaNodeId: text("container_area_node_id"),
  },
  (table) => [
    // The find-or-create DB-level race guard (mirrors milestones_entity_
    // criteria_unique's identical reasoning): two concurrent fold-in
    // approvals for the same Area can both observe "no container yet" before
    // either insert commits — this constraint, not the app-level read, is
    // what stops a second container from ever existing for the same
    // (subject, Area) pair. Postgres already treats NULL <> NULL, so every
    // ordinary curriculum (containerAreaNodeId NULL) is naturally exempt
    // without needing the explicit partial WHERE — kept anyway purely for
    // self-documentation.
    uniqueIndex("curricula_container_area_node_id_unique")
      .on(table.subjectId, table.containerAreaNodeId)
      .where(sql`${table.containerAreaNodeId} is not null`),
  ],
);

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
  // decouple-curricula-from-domain-nodes (issue #84) — "static_taxonomy" for
  // a node seeded once via seed-domain-taxonomy.ts, independent of any
  // curriculum; "ai_generated" (the default, for backward compatibility) for
  // every node created dynamically by resolveDomainPlacement's
  // sibling-discovery path, exactly as every existing row already is. This
  // is the signal resolveDomainNodeSource() (packages/core/src/curriculum-
  // domain-mapping/) reads to decide which of the two placement paths a
  // subject uses.
  source: text("source").notNull().default("ai_generated"),
  // learning-list-intake — "sub_subject" | "area" | null. Nullable with no
  // default because "unset" is the correct, representable state for every
  // node that predates fixed Areas (the whole 208-node it-taxonomy.yaml
  // tree): it says "this node is ordinary taxonomy", not "this is a broken
  // Area". Only web-dev-areas.yaml seeds a non-null kind today. This is the
  // column that makes "AI may never create an Area" enforceable rather than
  // conventional — resolveAreaPlacement resolves against kind = 'area' rows
  // only, and falls back to that sub-subject's "Other".
  kind: text("kind"),
});

// decouple-curricula-from-domain-nodes (issue #84) — the many-to-many
// replacement for curricula.domain_node_id (dropped in the same migration
// that backfills this table — see apps/api/src/db/migrations/). One row per
// (curriculum, domain node) placement, `status` tracking its own lifecycle:
// "suggested" (the AI mapping agent proposed it, unconfirmed — never counts
// toward a node's rollup or appears on the map), "confirmed" (the user
// approved it, or it was written directly by an explicit placement/the
// non-taxonomy auto path), "rejected" (the user declined it — kept, never
// deleted, same audit-trail convention as domain_priority_suggestions/
// domain_topic_suggestions/domain_supersession_suggestions). `source`
// records how a CONFIRMED row came to be: "ai_suggested" (accepted from a
// suggestion), "manual" (an explicit domainNodeId at create/update time),
// "auto" (the non-taxonomy-subject resolveDomainPlacement path, including
// pre-existing rows migrated from the old column — SCENARIO 10). Deleted
// only when its owning curriculum is deleted (SCENARIO 13).
export const curriculumDomainNodeMappings = pgTable(
  "curriculum_domain_node_mappings",
  {
    id: text("id").primaryKey(),
    curriculumId: text("curriculum_id").notNull(),
    domainNodeId: text("domain_node_id").notNull(),
    // DepthLevel ("awareness" | "working" | "deep"), app-level validated —
    // nullable until confirmed (a still-"suggested" row always carries the
    // agent's proposed depth too, but the column stays nullable to mirror
    // domain_nodes.target_depth's own "unset is representable" precedent).
    depth: text("depth"),
    status: text("status").notNull().default("suggested"),
    source: text("source").notNull().default("ai_suggested"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // getDomainMapForSubject() reads WHERE status = 'confirmed' on every
    // domain-map page load; listMappingsForCurriculum() reads WHERE
    // curriculum_id = ? on every curriculum detail page load — both hot,
    // frequent reads.
    index("curriculum_domain_node_mappings_domain_node_id_status_idx").on(
      table.domainNodeId,
      table.status,
    ),
    index("curriculum_domain_node_mappings_curriculum_id_idx").on(table.curriculumId),
    // learning-list fold-in creates a container's Area mapping on approval,
    // and two captures folding into the same Area can run concurrently. A
    // check-then-insert alone raced and produced duplicate live mappings, so
    // uniqueness is enforced here and the writer retries on 23505. Rejected
    // rows are excluded: re-suggesting a node whose mapping was rejected is
    // legitimate, and must not be blocked by an old tombstone.
    uniqueIndex("curriculum_domain_node_mappings_live_pair_unique")
      .on(table.curriculumId, table.domainNodeId)
      .where(sql`${table.status} <> 'rejected'`),
  ],
);

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

// doc-changelog-scan (issue #49) — one row per (subject, tracked tool)
// (apps/api/src/domain-map/tracked-tools.ts's TRACKED_TOOLS constant), the
// "never a firehose" watermark. last_content_hash null = never successfully
// scanned. Only advanced by the orchestrator for a tool INCLUDED in a
// successful agent call (spec.md's Decisions #9) — a changed tool whose
// agent call then fails keeps its OLD hash so it's retried next run.
//
// The subject dimension is load-bearing, not a convenience: keyed by
// tool_key alone, the first gated subject a scheduled run processed
// advanced every tool's hash, and every later subject in the same run read
// "nothing changed" and got no suggestions at all, indefinitely.
export const trackedToolScanState = pgTable(
  "tracked_tool_scan_state",
  {
    subjectId: text("subject_id").notNull(),
    toolKey: text("tool_key").notNull(),
    lastContentHash: text("last_content_hash"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.subjectId, table.toolKey] })],
);

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
  // content-library (module 5) — nullable, additive: a source that predates
  // this column, or one never re-fetched, simply has no recorded attempt.
  // This is what makes fetch state a real readable field instead of an
  // inference from `fetchedText IS NULL` — that null was already ambiguous
  // between "never attempted" and "attempted and failed" (see
  // resolveFetchState in packages/core/src/content-library/). Written on
  // EVERY re-fetch attempt regardless of outcome; `fetchedText` itself is
  // only overwritten when `lastFetchOutcome` is `"ok"` — a failed re-fetch
  // must never clobber a previously-good body.
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  // App-level validated: "ok" | "blocked" | "http_error" | "network_error"
  // (guardedFetchText's own outcome vocabulary) — deliberately not a pg enum,
  // matching every other enum-ish text column in this file.
  lastFetchOutcome: text("last_fetch_outcome"),
  // content-library (module 5) — mirrors subjects.embedding/embeddingHash/
  // embeddedAt exactly (see that column's own comment above), for the same
  // don't-re-embed-unchanged-content cache selectSubjectsForScan already
  // assumes, applied here to source-duplicate detection's embedding tier.
  embedding: jsonb("embedding").$type<number[]>(),
  embeddingHash: text("embedding_hash"),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }),
});

// `mergedFromCurriculumId` (on modules AND topics) is the provenance marker
// docs/architecture/curriculum-merge/review.md's "Proposed alternative" #1
// asks for: NULL means "this row traces back to its curriculum's own
// research/parse history", non-NULL names the curriculum a `mergeCurricula`
// reassignment moved it in from. `clearCurriculumStructure` — the recovery
// clear behind "Retry research"/"Reparse" — deletes only NULL-marked rows,
// so a curriculum that failed after absorbing another one's content no
// longer destroys that content on recovery. Deliberately NOT the
// `ontology_merges` audit log: that stores per-merge counts, not row
// identity, so it cannot answer "was THIS row merged in".
//
// It lives on both tables rather than modules alone because `updateTopic`
// reparents a topic across modules (`updateTopicInput.moduleId`), so a
// merged-in topic can end up under an original module and vice versa —
// module-derived provenance alone would lose it.
export const modules = pgTable("modules", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  title: text("title").notNull(),
  order: integer("order").notNull(),
  priority: integer("priority").notNull().default(0),
  learningStatus: text("learning_status").notNull().default("not_started"),
  level: text("level"),
  mergedFromCurriculumId: text("merged_from_curriculum_id"),
});

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  curriculumId: text("curriculum_id").notNull(),
  mergedFromCurriculumId: text("merged_from_curriculum_id"),
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
  // learning-list-intake — same nullable `concernSchema` text column as
  // curricula.concern/gaps.concern, app-level validated, no pg enum.
  concern: text("concern"),
  // Provenance back to the `sources` row that produced this topic. Without
  // it a topic folded into a shared Area is unattributable, and a declined
  // nudge cannot know which content to make dormant (architecture.md's
  // "Provenance loss" failure mode). Nullable: every topic that predates
  // learning-list intake has no single originating source, and topics
  // authored directly still won't.
  sourceId: text("source_id"),
  // Depth is elected when a topic FIRST comes up for study, not for every
  // topic at capture time. A null here means "never asked" — distinct from
  // `depth`, which always carries a value because of its own default. Once
  // set, gap generation is capped at the elected depth.
  depthElectedAt: timestamp("depth_elected_at", { withTimezone: true }),
  // The highest depth the underlying material could support, which is what
  // makes headroom ("you know the basics — want the advanced pass?")
  // computable against the elected depth. depthLevelSchema
  // ("awareness" | "working" | "deep"), app-level validated; null means no
  // headroom is known, never "no headroom exists".
  availableDepth: text("available_depth"),
  // lms-buildout 0.2 — separates "not yet released" from "learner excluded
  // it" for lazy slice release (see learning-list/slice-release.ts). Today
  // slice release picks its next batch from `included = false` alone, which
  // cannot tell a topic still queued for its first release apart from one a
  // learner deliberately dropped via `updateTopic({ included: false })` —
  // the latter must never be resurrected by a later release.
  //
  // NULL is NOT "unknown, skip" — it means "not declined", i.e. still
  // releasable. Every topic that predates this column, and every topic
  // `confirmStructure` creates with `defaultIncluded: false`
  // (curriculum-structure.ts) for the ordinary (non-learning-list) queued-
  // structure flow, carries NULL and must keep being treated as eligible for
  // release. Only an explicit "declined" here means "do not release this,
  // ever, until the learner re-includes it" — the app-level values are
  // "declined" (learner excluded) and "queued" (informational: known to be
  // awaiting first release). This column is intentionally NOT wired into
  // `updateTopic`/`slice-release.ts` yet — see topic-progress.repo.ts's
  // rowReleaseState/setTopicReleaseState for the accessor that a later
  // change wires the real predicate through.
  releaseState: text("release_state"),
  // lms-buildout 0.5 — persists shouldOfferHeadroom's `lastOfferAt` input
  // (packages/core/src/learning-list/headroom-offer.ts), which today only
  // lives in the web app's React state (apps/web/src/learning-list/
  // topic-depth-gate.tsx) and resets on reload, defeating the cooling-off
  // period. Set when the headroom offer is shown/declined; null means never
  // offered. Storage only — nothing writes it yet (see topic-progress.repo.ts's
  // rowHeadroomOfferedAt/setTopicHeadroomOfferedAt accessor).
  headroomOfferedAt: timestamp("headroom_offered_at", { withTimezone: true }),
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
  // Gap triage (issue #29) — a permanent 1:1 attribute of a gap, same shape
  // as `wanted`/`concern` above, not a `gap_mastery`-style sidecar (triage
  // is never a cycling/resettable counter). `triageState`'s literal enum
  // value is `user_deferred`, not `deferred` — reserves `auto_deferred` as a
  // future sibling (issue #33) without another migration touching this
  // column. `state` (open|covered|skipped) is completely untouched by any
  // of this — triage is an orthogonal concept layered on top.
  triageState: text("triage_state").notNull().default("untriaged"),
  triagedAt: timestamp("triaged_at", { withTimezone: true }),
  deferredUntil: timestamp("deferred_until", { withTimezone: true }),
  deferralCount: integer("deferral_count").notNull().default(0),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedCheckinSentAt: timestamp("dismissed_checkin_sent_at", { withTimezone: true }),
  // Auto-defer timer (issue #33). "The moment this gap most recently entered
  // the untriaged state" — one column covering BOTH of the issue's timer
  // rules (starts at creation; full reset on every return to untriaged).
  // notNull + defaultNow deliberately backfills existing rows with the
  // migration timestamp, so no historical gap mass-auto-defers on deploy day.
  untriagedSince: timestamp("untriaged_since", { withTimezone: true }).notNull().defaultNow(),
  // Stamped by the sweep only. `triagedAt` is deliberately NOT written on an
  // auto-defer — that column means "the user decided something," and this is
  // explicitly system housekeeping, not a user choice.
  autoDeferredAt: timestamp("auto_deferred_at", { withTimezone: true }),
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

export const openQuestions = pgTable(
  "open_questions",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceItemId: text("source_item_id").notNull(),
    topicId: text("topic_id"),
    topicTitle: text("topic_title"),
    questionText: text("question_text").notNull(),
    status: text("status").notNull().default("open"),
    answerText: text("answer_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("open_questions_status_created_at").on(table.status, table.createdAt)],
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

export const topicCardSets = pgTable(
  "topic_card_sets",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    status: text("status").notNull().default("generating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("topic_card_sets_topic_id_unique").on(table.topicId)],
);

export const topicCards = pgTable("topic_cards", {
  id: text("id").primaryKey(),
  cardSetId: text("card_set_id").notNull(),
  order: integer("order").notNull(),
  concept: text("concept").notNull(),
});

export const topicCardVariants = pgTable("topic_card_variants", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  order: integer("order").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
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

// learning-list-intake — one row per thing captured into the learning list,
// from paste through classification to whatever it became. No .references()
// FK, matching this schema's dominant convention (plain text columns +
// app-level validation).
//
// `url` and `rawText` are both nullable because the two capture modes are
// genuinely different: a pasted link stores the URL (and, once fetched,
// the extracted text), a pasted video description stores only the text
// (spec.md's scope boundary — no transcript fetching). At least one is
// always present; that's an app-level invariant, not a DB constraint,
// because Postgres cannot express it without a CHECK this file has no
// precedent for.
//
// `verdict` (single | series | unknown) and `recommendation` (fold_in |
// mini_course | park) are separate columns rather than one derived field
// specifically so an overridden recommendation never destroys the
// classifier's original verdict — S2 shows the deciding signals back to the
// user, which requires the verdict to survive the override.
//
// `questionsGenerated` is the ingestion CURSOR, not a total: it is what
// nextIngestionSlice resumes from after a nudge is accepted, so a dormant
// item that wakes up continues instead of restarting. `questionCeiling` is
// the hard stop that bounds runaway generation independently of liveness
// (architecture.md's "Runaway generation" failure mode) — nullable until
// planQuestionCeiling has run.
export const learningListItems = pgTable(
  "learning_list_items",
  {
    id: text("id").primaryKey(),
    url: text("url"),
    rawText: text("raw_text"),
    title: text("title"),
    kind: text("kind").notNull(),
    verdict: text("verdict"),
    recommendation: text("recommendation"),
    status: text("status").notNull().default("captured"),
    curriculumId: text("curriculum_id"),
    questionsGenerated: integer("questions_generated").notNull().default(0),
    questionCeiling: integer("question_ceiling"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The learning list itself is a status-filtered, newest-first read on
    // every page load, and the nudge sweep re-reads the same slice — the
    // one hot path this table has.
    index("learning_list_items_status_created_at_idx").on(table.status, table.createdAt.desc()),
  ],
);

// learning-list-intake — the 1–10 liveness score, polymorphic over the three
// things that carry one (learning-list items, curricula and domain nodes),
// following the existing tag_assignments / study_item_feedback / node_feedback
// convention rather than three parallel column sets on three tables. One
// scale, one decay rule, one nudge history.
//
// Deliberately a STORED ANCHOR, not a stored current score: `score` is the
// last explicitly-set value (starting score on approval, or the result of
// applyNudgeResponse), and the live score is derived at read time by decaying
// it against `lastActivityAt`. A scheduled recompute that missed a run would
// otherwise silently mark live items dead (architecture.md's "Liveness
// recomputation drift").
//
// A missing row reads as UNSET, never as dead — this is what lets every
// pre-existing curriculum and domain node keep behaving normally until its
// first recorded activity.
//
// `lastNudgeResponse` is the only thing that can make an entity dormant.
// A decayed score stops GENERATION; only an explicit decline stops
// SURFACING (spec.md's isDormant deriver).
export const liveness = pgTable(
  "liveness",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    score: integer("score").notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    lastNudgeAt: timestamp("last_nudge_at", { withTimezone: true }),
    lastNudgeResponse: text("last_nudge_response"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One liveness row per entity, enforced at the DB rather than by a
    // check-then-insert: answer submission and the nudge sweep can both
    // observe "no row yet" for the same entity before either insert
    // commits (the same race guard subject_duplicate_suggestions_pending_
    // pair_unique above exists for). Also the read index — every liveness
    // lookup is by exactly this pair.
    uniqueIndex("liveness_entity_unique").on(table.entityType, table.entityId),
  ],
);

// lms-buildout 0.7 — `domain_nodes` is a strict single-parent tree
// (`parentId`), but some nodes genuinely belong under more than one place:
// AWS sits under Web Development for the fixed-Areas taxonomy (see
// web-dev-areas.yaml) but is also Cloud Computing (it-taxonomy.yaml's own
// root). This table adds an explicit SECONDARY edge without disturbing the
// tree — `parentId` still decides where a node renders; this is an
// additional cross-reference read alongside it, never a substitute. No
// .references() FK, matching domain_nodes' own convention.
//
// `kind` is app-level validated free text, not a pg enum — "also_in" is the
// only value seeded today (seed-domain-taxonomy.ts's AWS/Cloud Computing
// link), but this stays open so a second link semantic never needs a
// migration. Directional: fromNodeId "is also" toNodeId, not symmetric —
// a reverse lookup reads the toNodeId index below.
export const domainNodeLinks = pgTable(
  "domain_node_links",
  {
    id: text("id").primaryKey(),
    fromNodeId: text("from_node_id").notNull(),
    toNodeId: text("to_node_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Existence-checked SELECT-before-INSERT (seed-domain-taxonomy.ts) relies
    // on this being unique so a second seed run creates nothing new.
    uniqueIndex("domain_node_links_from_to_kind_unique").on(
      table.fromNodeId,
      table.toNodeId,
      table.kind,
    ),
    // Reverse lookup — "what links to this node" — isn't covered by the
    // composite unique index above, which only serves fromNodeId-first reads.
    index("domain_node_links_to_node_id_idx").on(table.toNodeId),
  ],
);

// learning-paths (module 1) — the taxonomy's own prerequisite graph,
// revived from `it-taxonomy.yaml`'s `prerequisites:` field (dropped since
// the intake module, see `parse-taxonomy-yaml.ts`'s own history). An edge
// table, not a column on `domain_nodes` — same reasoning as
// `domain_node_links` above: never put a foreign id inside `domain_nodes`
// itself. No `.references()` FK, matching this schema's dominant
// convention. Seeded in a second pass by `seed-domain-taxonomy.ts`, after
// every node in every taxonomy YAML file has been inserted, so a forward or
// cross-branch reference (e.g. `cloud-computing`'s prerequisites naming
// `networking`, declared earlier in the file) resolves regardless of
// declaration order. `resolvePathOrder` (packages/core/src/learning-path/)
// restricts these edges to a path's chosen target set at read time — this
// table itself has no notion of "path".
export const domainNodePrerequisites = pgTable(
  "domain_node_prerequisites",
  {
    id: text("id").primaryKey(),
    domainNodeId: text("domain_node_id").notNull(),
    prerequisiteNodeId: text("prerequisite_node_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Existence-checked SELECT-before-INSERT (seed-domain-taxonomy.ts) relies
    // on this being unique so a second seed run creates no duplicate edges —
    // same idempotency convention as domain_node_links_from_to_kind_unique.
    uniqueIndex("domain_node_prerequisites_node_prerequisite_unique").on(
      table.domainNodeId,
      table.prerequisiteNodeId,
    ),
    // "what does this node require" is the only read direction
    // resolvePathOrder needs — a node's own prerequisites, forward.
    index("domain_node_prerequisites_domain_node_id_idx").on(table.domainNodeId),
  ],
);

// learning-paths (module 1) — an ordered route through EXISTING taxonomy
// nodes toward a target role (e.g. "Frontend Engineer"). A path never
// creates a domain node, a curriculum, or any content — it is a read/order
// overlay on structure that already exists (spec.md's Decisions). No
// `.references()` FK, matching this schema's dominant convention.
export const learningPaths = pgTable("learning_paths", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetRoleLabel: text("target_role_label").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// learning-paths (module 1) — a path's ordered steps. `domainNodeId` is the
// ONLY foreign reference a step carries — never a curriculum id. Content is
// discovered live via `curriculum_domain_node_mappings` (status
// "confirmed") under that node's subtree, exactly like the domain map
// already does; this is the same inversion `decouple-curricula-from-
// domain-nodes` established (spec.md's Decisions). Deliberately no
// progress/status column: a step's status is always derived at read time
// (`pathProgress`/`nextPathStep`), never stored, so it can never drift from
// live curriculum/gap data.
export const learningPathSteps = pgTable(
  "learning_path_steps",
  {
    id: text("id").primaryKey(),
    pathId: text("path_id").notNull(),
    domainNodeId: text("domain_node_id").notNull(),
    // Snapshotted at creation from resolvePathOrder's output, never
    // recomputed — if prerequisite edges change later (a future taxonomy
    // edit), an in-progress path does not silently reshuffle underneath the
    // learner (spec.md's Decisions).
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every path-detail read fetches a path's own steps, in order.
    index("learning_path_steps_path_id_idx").on(table.pathId),
  ],
);

// learning-brain (module 2) — Postgres tsvector has no native drizzle
// column type; this is the "no new dependency" native-FTS column the spec
// asks for, kept maintained at APPLICATION write time (note.repo.ts) rather
// than a DB-generated column or trigger — this schema has no precedent for
// either, and a plain write keeps every write path visible in TypeScript.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// learning-brain (module 2) — one polymorphic table for a note or highlight
// captured against a topic, gap or source, following the existing
// `tag_assignments`/`node_feedback`/`study_item_feedback` `nodeType`/
// `nodeId` convention rather than three parallel tables. No `.references()`
// FK, matching that same convention. `isHighlight` is a flag on the same
// row, not a separate entity — a highlight and a note are mechanically
// identical (captured text at a point). `concern` reuses the existing
// `concernSchema` vocabulary (see curricula.concern/topics.concern above),
// app-level validated, no pg enum. `lastSurfacedAt` is an anti-repeat
// heuristic only for the pull-only review surface — never a review-debt
// signal, never written by anything but that surface (spec.md's Decisions).
export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    nodeType: text("node_type").notNull(),
    nodeId: text("node_id").notNull(),
    body: text("body").notNull(),
    isHighlight: boolean("is_highlight").notNull().default(false),
    concern: text("concern"),
    searchVector: tsvector("search_vector"),
    lastSurfacedAt: timestamp("last_surfaced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Full-text search — GIN, per spec.md's explicit "native Postgres
    // tsvector/GIN, no new dependency" data-model instruction.
    index("notes_search_vector_idx").using("gin", table.searchVector),
    // "notes attached to this thing" — the capture surfaces' own hot read.
    index("notes_node_type_node_id_idx").on(table.nodeType, table.nodeId),
  ],
);

// study-scheduling (module 3) — a single table across a session's whole
// lifecycle (planned -> in_progress -> completed/abandoned), not a separate
// "schedule" and "run record" — mirrors probe_sessions' own single-table-
// with-status-lifecycle precedent (spec.md's Decisions). No `.references()`
// FK, matching this schema's dominant convention. `targetType`/`targetId`
// are both nullable together: `targetType: null` means "anything" (the
// same unscoped candidate pool gatherPushCandidates already produces), not
// a broken reference. `questionsAnswered`/`questionsCorrect` are running
// counters incremented as each existing single-gap probe endpoint answer
// resolves — no new per-answer table, unlike probe_session_questions.
export const studySessions = pgTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    plannedDurationMinutes: integer("planned_duration_minutes").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    status: text("status").notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    questionsAnswered: integer("questions_answered").notNull().default(0),
    questionsCorrect: integer("questions_correct").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The schedule list (upcoming/missed) and the consistency rollup
    // (planned-vs-completed in a rolling window) both filter by status and
    // order by scheduledFor — the two hot reads this table has.
    index("study_sessions_status_scheduled_for_idx").on(table.status, table.scheduledFor),
  ],
);

// content-library (module 5) — one row per candidate duplicate pair the
// library's two-tier detection surfaces: exact normalized-URL matches
// (`matchKind: "url_match"`, `similarity: null` — there is no score, just a
// match) and embedding-similarity matches (`matchKind: "embedding_similarity"`,
// a real float). Sibling to subject_duplicate_suggestions above, same
// pending/acknowledged/dismissed lifecycle and same partial-unique
// concurrency guard, but deliberately reporting-only: resolving a suggestion
// here only ever moves `status`, never merges or deletes a `sources` row.
// `topics.sourceId` is a provenance link a declined liveness nudge depends on
// to make the right content dormant — auto-merging two source rows the way
// mergeSubjects does for subjects would silently orphan that link for any
// topic pointing at the "losing" source. No `.references()` FK, matching
// this schema's dominant convention.
//
// sourceAId/sourceBId store an UNORDERED pair, always in CANONICAL
// lexicographic order (sourceAId < sourceBId), same convention as
// subjectDuplicateSuggestions — this is what lets the plain two-column
// partial unique index below enforce "at most one pending row per pair"
// regardless of which source a caller names first.
export const sourceDuplicateSuggestions = pgTable(
  "source_duplicate_suggestions",
  {
    id: text("id").primaryKey(),
    sourceAId: text("source_a_id").notNull(),
    sourceBId: text("source_b_id").notNull(),
    similarity: real("similarity"),
    matchKind: text("match_kind").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // DB-level race guard, not just an app-level check-then-act guard —
    // mirrors subject_duplicate_suggestions_pending_pair_unique's identical
    // reasoning: a double-click on "scan for duplicates", or two browser
    // tabs, can both observe "no pending row yet" for the same pair before
    // either insert commits.
    uniqueIndex("source_duplicate_suggestions_pending_pair_unique")
      .on(table.sourceAId, table.sourceBId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

// milestones (module 6) — a one-time, un-losable fact: this curriculum or
// this Area (domain_nodes.kind = 'area') reached 100% mastered. Polymorphic
// over the two entity types, mirroring `liveness`'s identical
// entityType/entityId convention rather than doubling the repo/controller
// code path for a mechanically identical write. No `.references()` FK,
// matching this schema's dominant convention.
//
// `criteriaKey` is kept as an open string ("full_mastery" is the only value
// today), not a 2-value enum — mirrors domain_node_links.kind's same
// "stays open" precedent, so a future criteria type needs no migration.
//
// Never updated after insert and never deleted by any code path: a later
// structural change (a new topic added to an already-100%-mastered
// curriculum, a new curriculum mapped under an already-100%-mastered Area)
// can drop the LIVE percent back below 100, but the awarded milestone does
// not care — milestone.repo.ts's read path never re-derives from live
// percent for an already-awarded row, it only reads this table.
export const milestones = pgTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    criteriaKey: text("criteria_key").notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The concurrent-double-award guard: two tabs, or a retry, both
    // observing "not yet awarded" before either insert commits — same race
    // shape as lectures_topic_id_unique/subject_duplicate_suggestions_
    // pending_pair_unique. milestone.repo.ts catches the 23505 this raises
    // and treats it as a no-op, never a second row.
    uniqueIndex("milestones_entity_criteria_unique").on(
      table.entityType,
      table.entityId,
      table.criteriaKey,
    ),
  ],
);

// study-material-generation (module 7) — worked examples and analogies,
// requested per topic. One polymorphic table with a `kind` column, not two
// tables — mirrors learning_list_items.kind/notes.isHighlight's established
// single-table-multi-kind convention: one repo, one controller, one review
// pattern, two prompt branches. No `.references()` FK, matching this
// schema's dominant convention.
//
// Deliberately NO unique index on `topicId`, unlike `lectures_topic_id_
// unique` — "on demand" explicitly means re-requesting is allowed, a second
// worked example with a different angle is a new row, not an overwrite.
// History accumulates by design; unlike `notes`, this content is
// AI-generated and never counted as a debt, so there is no
// `.product/REJECTED.md` revision-log tension in letting rows pile up.
//
// `citations` is a flat jsonb array, not a split lecture_citations-style
// table — a worked example or analogy is a single body of text with a flat
// citation list, never multiple ordered sections the way a lecture is.
// Mirrors probe_session_questions.optionExplanations' existing
// jsonb $type<...>() precedent for a small structured array that doesn't
// need its own table.
export const studyMaterials = pgTable(
  "study_materials",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("generating"),
    body: text("body"),
    citations: jsonb("citations").$type<{ title: string; url: string }[]>(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Non-unique — see the no-unique-index comment above. listStudyMaterials
    // reads every row for a topic, newest first, and rows are never deleted
    // (re-request accumulates a new row) — same growing-scan-and-sort hazard
    // domain_priority_suggestions_subject_created_at_idx exists to prevent.
    index("study_materials_topic_id_created_at_idx").on(table.topicId, table.createdAt.desc()),
  ],
);
