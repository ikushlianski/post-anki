---
type: spec
branch: grounded-knowledge-map
task: Mandatory trusted-source grounding + approval gate for course creation, pre-assessment step, cross-cutting tags, quiz preload/replenish, and conversational structure shaping
complexity: complex
state: confirmed
updated: 2026-07-19
---
# Spec: Grounded knowledge map

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Trusted sources + approval gate | 1-9 | Candidate-gathering pipeline (docs chain + bounded crawl + general search), pending-source model, approval endpoint, unify bare-name into grounded pipeline | Approval panel (review/delete/add), web form's docUrl becomes optional, ungrounded-quiz notice, bot reply copy | None — builds directly on shipped `doc-link-technology-intake`/`use-case-study-mode` | Candidate gathering bounded: ≤2 llms.txt probes + ≤8 crawled pages + 1 general search call per creation |
| 2 — Pre-assessment step | 10-12 | `preAssessmentCompletedAt` column + completion endpoint | One-time self-grade screen, confirm-flow redirect | None — independent of Phase 1 | N/A (one-time UI step) |
| 3 — Cross-cutting tags | 13-16 | `tags`/`tag_assignments` tables, tag CRUD, new `"tag"` probe scope + context resolution, AI tag suggestion in both architect agents | Tag chip UI on module/topic rows, tag list + tag-scoped session entry point | None — independent of Phases 1/2, but shares `probe-session.generate.ts`/`probe-session.repo.ts` files with Phase 4 (sequence within this plan, not a cross-plan risk) | N/A |
| 4 — Quiz preload/replenish | 17-20 | Replenish trigger + guard + gap-biased batch generation | Refetch-on-low in web quiz UI and bot quiz-flow | Touches the same `probe-session.generate.ts`/`.repo.ts`/`.service.ts` files as Phase 3 — implement Phase 3 first, then Phase 4, to avoid rebasing one on top of the other mid-implementation | Replenish batch generation starts the instant remaining ≤ 10, same generation-latency profile as today's initial batch |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `extractSameSiteLinks` (`packages/core/src/curriculum/source-candidates.ts`, new) | `html: string`, `origin: string`, `cap: number` | `string[]` — absolute URLs on the same origin found in the page, capped at `cap`, deduped | SCENARIO 1, 9 |
| `dedupeSourceCandidates` (same file) | `candidates: SourceCandidate[]` (`{ url, title, discoveryTier }[]`) | `SourceCandidate[]` — deduped by URL, first-tier-found wins | SCENARIO 1, 6 |
| `normalizeTagName` (`packages/core/src/tag/tag-rules.ts`, new) | `name: string` | `string` — trimmed, lowercased, whitespace-collapsed | SCENARIO 13, 15 |
| `shouldReplenish` (`packages/core/src/probe-session/replenish.ts`, new) | `total: number`, `answered: number`, `floor: number` | `boolean` — `total - answered <= floor` | SCENARIO 17, 18, 20 |
| `rankGapsForReplenish` (same file) | `gaps: Gap[]` | `Gap[]` — reuses `openGaps`'s existing wanted-first/shallower-depth-first ordering (`packages/core/src/curriculum/gap.ts`), applied to a replenish call site for the first time | SCENARIO 19 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `apps/api/src/curriculum/source-candidates.ts` (new — orchestrates chain), `apps/api/src/curriculum/doc-link-grounding.ts` (crawl tier added), `apps/api/src/curriculum/curriculum-parse.orchestrator.ts` (`researchCurriculum` split), `packages/core/src/curriculum/source-candidates.ts` (new derivers) | `apps/web/src/curriculum/study-technology-form.tsx` (docUrl optional) | None |
| SCENARIO 2 | `apps/api/src/curriculum/curriculum.controller.ts` (+ `handleApproveSources`), `apps/api/src/db/schema.ts` (+ status value, `approvalStatus`) | `apps/web/src/curriculum/source-approval-panel.tsx` (new) | None |
| SCENARIO 3 | `apps/api/src/curriculum/curriculum.repo.ts` (delete/insert pending rows) | `source-approval-panel.tsx` — remove button + add-link form (reuses `source-rows-editor.tsx` pattern) | None |
| SCENARIO 4 | `apps/api/src/curriculum/curriculum.controller.ts` (reject approve action with 0 approved + no override flag) | `source-approval-panel.tsx` — disabled state | None |
| SCENARIO 5 | `apps/api/src/curriculum/curriculum-parse.orchestrator.ts` (override path still calls synthesis with empty sources — same as today's empty-grounding fallback) | `source-approval-panel.tsx` — empty-state warning + distinct override action | None |
| SCENARIO 6 | `apps/api/src/curriculum/tech-research-grounding.ts` (new trusted-source-scoped search variant), `source-candidates.ts` | `source-approval-panel.tsx` — discovery-tier label per row | None |
| SCENARIO 7 | `apps/api/src/curriculum/curriculum-parse.orchestrator.ts` (unchanged trigger, new candidate-gathering behavior) | `apps/bot/src/telegram/webhook.handler.ts` or `apps/bot/src/conversation/study-flow.ts` (reply copy) | None |
| SCENARIO 8 | None — reuses existing `getCurriculumCitableUrls` | `apps/web/src/curriculum/probe-session-quiz.tsx` (notice when allowlist empty) | None |
| SCENARIO 9 | `packages/core/src/curriculum/source-candidates.ts` (`extractSameSiteLinks` cap), `apps/api/src/curriculum/doc-link-grounding.ts` (crawl call site passes the cap) | None | None |
| SCENARIO 10 | `apps/api/src/curriculum/curriculum.repo.ts` (+ `markPreAssessmentCompleted`), `apps/api/src/db/schema.ts` (+ `preAssessmentCompletedAt`) | `apps/web/src/routes/curriculum.$curriculumId.assess.tsx` (new route) | None |
| SCENARIO 11 | None — reuses existing `selfGrade` column/validation | `curriculum.$curriculumId.assess.tsx` reuses existing `self-grade.tsx` widget | None |
| SCENARIO 12 | None — `selfGrade` already nullable/optional | `curriculum.$curriculumId.assess.tsx` — "Start studying" always enabled | None |
| SCENARIO 13 | `apps/api/src/db/schema.ts` (`tags`, `tag_assignments`), `apps/api/src/tag/tag.repo.ts` (new), `packages/core/src/tag/tag-rules.ts` (new) | `apps/web/src/curriculum/module-section.tsx`, `topic-row.tsx` (tag chip add/remove control) | None |
| SCENARIO 14 | `apps/api/src/probe-session/probe-session.repo.ts` (`getScopeContext` `"tag"` branch), `packages/shared/src/probe-session.ts` (`probeScopeSchema` widened) | `apps/web/src/routes/probe.tag.$tagId.tsx` (new route) | None |
| SCENARIO 15 | `apps/api/src/mastra/curriculum-architect.agent.ts`, `apps/api/src/mastra/doc-research-architect.agent.ts` (+ `tags` output), `apps/api/src/curriculum/curriculum-plan.ts`/`curriculum-research-plan.ts` (schema), `curriculum.repo.ts`'s `saveCurriculumPlan` (resolve/create tags) | `module-section.tsx` renders AI-seeded tags identically to manual ones | None |
| SCENARIO 16 | `apps/api/src/probe-session/probe-session.service.ts` (verified unchanged — `refreshTopicProgress`/`syncSessionCounters`/gap-closing already resolve per-topic/per-gap, not per-session-curriculumId) | None | None |
| SCENARIO 17 | `apps/api/src/probe-session/probe-session.service.ts` (replenish trigger) | `apps/web/src/curriculum/probe-session-quiz.tsx` (refetch-on-low) | None |
| SCENARIO 18 | `apps/api/src/probe-session/probe-session.generate.ts` (`generateReplenishBatch`), `apps/api/src/db/schema.ts` (+ `replenishing`) | `probe-session-quiz.tsx` — no loading-state block on the loaded questions while replenish runs | None |
| SCENARIO 19 | `packages/core/src/probe-session/replenish.ts` (`rankGapsForReplenish`), `probe-session.generate.ts` (uses it for replenish only) | None | None |
| SCENARIO 20 | `apps/api/src/probe-session/probe-session.service.ts` (`replenishing` guard check) | None | None |

### Files to create

```
packages/core/src/
  curriculum/source-candidates.ts       — extractSameSiteLinks, dedupeSourceCandidates
  curriculum/source-candidates.test.ts
  tag/tag-rules.ts                      — normalizeTagName
  tag/tag-rules.test.ts
  probe-session/replenish.ts            — shouldReplenish, rankGapsForReplenish
  probe-session/replenish.test.ts

apps/api/src/
  curriculum/source-candidates.ts       — orchestrates candidate gathering (docs chain + crawl + general search)
  tag/tag.repo.ts                       — tag CRUD, resolveOrCreateTag(normalizedName), assignTag, removeTagAssignment
  tag/tag.controller.ts                 — GET /tags, POST /tags/:id/assignments, DELETE /tags/:id/assignments/:assignmentId
  tag/tag.service.ts                    — thin service wrapping repo, matches existing module shape (compare probe-session/ layering)

apps/web/src/
  curriculum/source-approval-panel.tsx  — pending-source review UI
  routes/curriculum.$curriculumId.assess.tsx  — pre-assessment screen
  routes/probe.tag.$tagId.tsx           — tag-scoped quiz/study entry point
  curriculum/tag-picker.tsx             — add/remove tag control, reused on module + topic rows
```

### Files to modify

```
packages/shared/src/
  curriculum.ts     — curriculumStatusSchema + "awaiting_source_approval"; + approveSourcesInput
  source.ts         — sourceSchema + approvalStatus ("pending" | "approved")
  probe-session.ts  — probeScopeSchema + "tag"; ProbeSession.curriculumId → nullable
  tag.ts (new file) — tagSchema, tagAssignmentSchema

apps/api/src/db/schema.ts
  — curricula: no enum column change needed (status is already plain text, additive value only)
  — curricula: + preAssessmentCompletedAt (timestamp, nullable)
  — sources: + approvalStatus (text, default "approved")
  — probeSessions: curriculumId nullable, + replenishing (boolean, default false)
  — + tags, + tagAssignments tables

apps/api/src/curriculum/
  curriculum-parse.orchestrator.ts   — researchCurriculum split into candidate-gathering only;
                                        new generateCurriculumFromApprovedSources(curriculumId);
                                        bare-name path resolves a docs URL first, then reuses
                                        the same chain as an explicit docUrl
  doc-link-grounding.ts              — + bounded same-site crawl tier (single hop, capped page
                                        count) between llms-full.txt and the old anchored-search
                                        fallback; returns SourceCandidate[] instead of one
                                        combined DocLinkGrounding when called from the new
                                        candidate-gathering path (existing single-DocLinkGrounding
                                        callers, if any remain, keep their existing shape)
  tech-research-grounding.ts         — + a trusted-source-scoped search variant (prompt asks
                                        specifically for official blogs/research papers)
  curriculum.controller.ts           — + handleApproveSources; handleCreateCurriculum's
                                        precedence logic unchanged in shape (still 400s on
                                        conflicting docUrl/researchTopic/sources)
  curriculum.repo.ts                 — + markPreAssessmentCompleted; saveCurriculumPlan resolves
                                        proposed per-module tags against tags table
  curriculum-plan.ts / curriculum-research-plan.ts — + optional tags: string[] per module

apps/api/src/mastra/
  curriculum-architect.agent.ts      — instructions + optional per-module tags output
  doc-research-architect.agent.ts    — same

apps/api/src/probe-session/
  probe-session.repo.ts              — getScopeContext: + "tag" branch; ScopeContext.curriculumId
                                        → string | null; ScopeTopic + curriculumId field
  probe-session.generate.ts          — generateProbeBatch's per-topic grounding fetch uses each
                                        topic's own curriculumId (not ctx.curriculumId) when
                                        present; + generateReplenishBatch using
                                        rankGapsForReplenish
  probe-session.service.ts           — answerProbeSession: shouldReplenish check + replenishing
                                        guard + fire-and-forget generateReplenishBatch call

apps/api/src/tag/  (new module, see Files to create)

apps/web/src/curriculum/
  study-technology-form.tsx          — docUrl becomes optional; blank docUrl submits
                                        researchTopic: name instead
  curriculum.$curriculumId.tsx       — renders SourceApprovalPanel when status is
                                        awaiting_source_approval; redirect to the assess route
                                        after confirm when preAssessmentCompletedAt is null
  probe-session-quiz.tsx             — refetch-on-low after each answer; ungrounded-source notice
  module-section.tsx, topic-row.tsx — render tag chips + TagPicker control
  curriculum.api.ts                 — approveSources, completePreAssessment mutations;
                                        listTags/assignTag/removeTagAssignment client calls

apps/bot/src/
  telegram/webhook.handler.ts (or conversation/study-flow.ts, whichever owns /study's reply)
                                     — updated copy for the bare-name gated flow
  quiz/quiz-flow.ts                 — refetch-on-low check before declaring "no more questions"
```

### Data model changes

See `architecture.md`'s "Data model evolution" table for the full list. Summary: one new enum value (`curricula.status`), three new nullable/defaulted columns (`curricula.preAssessmentCompletedAt`, `sources.approvalStatus` defaulted not nullable, `probeSessions.replenishing` defaulted not nullable), one constraint relaxation (`probeSessions.curriculumId` nullable), two new tables (`tags`, `tagAssignments`). One Drizzle-generated migration covering all of it, generated after every schema.ts edit above is in place — never hand-written, per the constitution's migration rule.

### Documentation changes

- **New**: `docs/architecture/grounded-knowledge-map.md` — this plan's own architecture doc, covering all four phases, published during implementation using the diagrams already drafted in `architecture.md`.
- **Existing, extended**: `docs/architecture/use-case-study-mode.md` — the "Pipeline" section's fallback-chain description and diagram need a new candidate-gathering/approval step inserted between grounding and synthesis; the "bare-name path is a deliberate non-decision for the bot" note needs updating since the bot's `/study` now also triggers the full grounded pipeline (still without an approval UI of its own — the boundary itself is unchanged, just what happens before it).
- **Existing, extended**: `docs/architecture/topic-study-experience.md` — gains a short subsection on the replenish mechanism, alongside its existing "Extension: grounded per-option explanations..." subsection from the sibling plan, following that same pattern (an appended subsection, not a rewrite).

### Decisions made autonomously

1. **The bare-name (`researchTopic`) path is unified into the same grounded+approval pipeline as `docUrl`, rather than kept as a separate weaker legacy path.** The task explicitly requires "if no source is provided, the app must go do a real web search" — today's bare-name path already does a web search, but hands the result straight to synthesis with no approval step and no llms.txt-first preference. Giving it its own second-class treatment would leave exactly the ungrounded-course-creation gap the whole feature exists to close. A new "resolve the likely official docs URL from a bare name" step in front of the existing chain was the smallest change that unifies the two without forking the approval/candidate logic into two implementations.
2. **The web form's `docUrl` field becomes optional, and a blank value submits the existing `researchTopic` field** instead of adding a third trigger field. The task's own example ("give me a course on Next.js") is phrased as a broad, URL-less ask, and today's web form has no way to make that request at all (it currently mandates a docUrl) — the bot already sends `researchTopic` for exactly this case, so reusing that existing, already-validated field is less surface area than inventing a parallel one.
3. **Rejected candidates are hard-deleted, not marked with a persisted "rejected" status.** Nothing downstream (audit trail, retry logic) needs to remember that a specific URL was once proposed and declined — `sourceKindSchema`'s existing precedent for `sources` rows is "what's here is what's real," and the sibling `doc-link-technology-intake` plan's own origin-tracking design never anticipated a third disposition. Two states (`pending`/`approved`) is the smaller, sufficient model.
4. **The llms.txt/llms-full.txt tier's candidate is stored with `fetchedText` already populated**, unlike the crawl-tier and general-search candidates (which store `fetchedText: null` until approved). The existence-probe for that tier already requires fetching the full body to run `looksLikeLlmsTxtContent`'s soft-404 check — the content is already in memory at zero extra cost, so deferring its storage would only add complexity for no savings. Crawl-tier and general-search candidates are cheaper to leave unfetched until approved (avoids paying for full-page fetches of candidates the learner might reject).
5. **The "warning, not encouraged" requirement is implemented as two separate, independently-verifiable mechanisms** (a hard structural block on course creation without approved sources, and a soft UI notice at quiz time when a curriculum's citation allowlist is empty) rather than one combined check. The task's own two sentences describe genuinely different moments (creation-time discouragement vs. an already-existing course being studied) and conflating them into one gate would leave the second moment — studying an old or override-created ungrounded course — silently uncovered.
6. **No new "training-data-recall" detector of any kind.** Per the task's explicit instruction, the gate is structural: can the architect agent be reached without at least one approved source? The answer is hard-coded to no (short of the explicit override), never inferred from output content.
7. **Discovery-tier labeling ("official docs" / "blog post" / "research paper") lives in the candidate row's existing `title` text field, not a new `sources.kind` enum value.** Nothing downstream branches on which tier found a candidate — only the approval screen displays it — so widening a schema-level enum for a display-only distinction isn't justified; this mirrors the existing `title`-carries-provenance-detail pattern the sibling `doc-link-technology-intake` plan already established for its `llms.txt:`/`llms-full.txt:` title prefixes.
8. **The bounded crawl is a genuinely new tier inserted between `llms-full.txt` and the old anchored-search fallback**, not a replacement for the existing chain. `llms.txt`/`llms-full.txt`, when present, are already comprehensive maps of a site — crawling on top of them would be redundant cost for no benefit. The crawl only runs when neither well-known file exists, which is exactly the case the task's "read other same-site pages it links to" instruction is describing (a site with no curated self-map, requiring the app to build one by reading the index page's own links).
9. **The pre-assessment step gates a one-time *visit*, not a per-topic completion requirement.** `selfGrade` is already an optional, skippable field wherever it's used today (`isTopicTouched`'s lock, the maturity tiebreaker) — requiring every topic to be graded before "Start studying" becomes reachable would be a new mandatory-completion concept this app has never had, and the task's own wording ("let the user self-grade... before starting") describes an opportunity, not a gate on individual topics.
10. **AI tag suggestion is included in Phase 3, not deferred as a follow-up.** Without it, the cross-cutting study feature has literally nothing to show until a learner manually tags topics across several existing, unrelated curricula first — a real adoption dead end for a feature whose entire value proposition is discovering cross-cutting concepts the learner might not think to hand-tag for. The risk (a near-duplicate tag name slipping through `normalizedName`'s exact-after-normalization match) is logged in `architecture.md`'s Failure modes as an accepted, correctable-by-hand limitation, not blocked on.
11. **`tags`/`tag_assignments` reuse `node_feedback`'s existing polymorphic `nodeType`/`nodeId` pattern** rather than two separate `module_tags`/`topic_tags` junction tables. This is the only place in the schema that already solves "one thing attaches to either a module or a topic generically," and duplicating that shape into two near-identical tables would be new inconsistency, not a simplification.
12. **`probeSessions.curriculumId` is relaxed to nullable rather than restructured into a per-question field or removed.** Verified directly during planning that no downstream logic (`refreshTopicProgress`, `syncSessionCounters`, gap-closing) reads it as a filter key — it is a read-back convenience field only. Nullable-for-tag-scope is the minimal change that keeps the field meaningful for module/topic scope (where it's always a real value) while being honest that a tag scope has no single curriculum to report.
13. **Replenish uses refetch-on-low on the client, not a new polling loop or a push mechanism (SSE/websocket).** This app has no existing polling or push infrastructure anywhere in the frontend; introducing one for a single low-water-mark check would be disproportionate. A one-shot re-check triggered by the same event that already drives every other state change in this UI (submitting an answer) is consistent with how the rest of the quiz UI already works, and the acceptable staleness window (learner might not see brand-new questions until their *next* answer if generation is still mid-flight) is bounded by the 10-question floor, not open-ended.
14. **Replenish's gap-prioritization (`rankGapsForReplenish`) is wired only into the replenish call site, not retrofitted into the very first batch's generation.** The first batch has no "current session" history yet to prioritize by (there's nothing wrong yet to be weak on), so `openGaps`'s wanted/depth ranking is a like-for-like improvement specifically for a mid-session top-up, where "what has this learner already struggled with in this session" is a real, available signal. Changing the first batch's behavior is a larger, separately-scoped change with no scenario in this plan requiring it.
15. **Multi-course-per-technology requires no schema or workflow change** — verified directly against `apps/api/src/db/schema.ts` that `curricula.subjectId` already permits any number of curricula per subject, and the existing web UI (`subject-section.tsx`) already supports creating another curriculum under the same subject at any time with no uniqueness constraint on name. This plan does not touch the Subject/Curriculum relationship at all.

### Implementation order

**Phase 1**
1. `/tdd extractSameSiteLinks` + `dedupeSourceCandidates` — covers SCENARIO 1, 6, 9
2. `packages/shared`: `curriculumStatusSchema`, `sourceSchema.approvalStatus`, `approveSourcesInput`
3. `apps/api/src/db/schema.ts`: `sources.approvalStatus`; generate + apply migration (combine with Phase 2/3/4 schema edits before generating, per the constitution's "generate against the final shape" note — or generate incrementally per phase if phases ship independently; either is acceptable, log which was chosen at implementation time)
4. `doc-link-grounding.ts`: bounded crawl tier
5. `tech-research-grounding.ts`: trusted-source-scoped search variant
6. `apps/api/src/curriculum/source-candidates.ts`: orchestrates all tiers into a deduped `SourceCandidate[]`
7. `curriculum-parse.orchestrator.ts`: split `researchCurriculum` into candidate-gathering + new `generateCurriculumFromApprovedSources`; bare-name docs-URL resolution step
8. `curriculum.controller.ts`: `handleApproveSources`
9. `apps/web`: `study-technology-form.tsx` (optional docUrl), `source-approval-panel.tsx`, wire into `curriculum.$curriculumId.tsx`
10. `apps/bot`: `/study` reply copy
11. `probe-session-quiz.tsx`: ungrounded-source notice (reuses existing `getCurriculumCitableUrls`)

**Phase 2**
12. `apps/api/src/db/schema.ts`: `curricula.preAssessmentCompletedAt`; migration
13. `curriculum.repo.ts`: `markPreAssessmentCompleted`
14. `apps/web`: `curriculum.$curriculumId.assess.tsx`, redirect wiring in `curriculum.$curriculumId.tsx`

**Phase 3**
15. `/tdd normalizeTagName` — covers SCENARIO 13, 15
16. `apps/api/src/db/schema.ts`: `tags`, `tagAssignments`; migration
17. `apps/api/src/tag/`: repo, controller, service
18. `curriculum-architect.agent.ts` / `doc-research-architect.agent.ts`: + tags output; `curriculum-plan.ts`/`curriculum-research-plan.ts` schema; `saveCurriculumPlan` tag resolution
19. `probe-session.repo.ts`: `"tag"` scope branch, `ScopeContext`/`ScopeTopic` curriculumId changes
20. `probe-session.generate.ts`: per-topic curriculumId in grounding fetch
21. `apps/web`: `tag-picker.tsx`, wire into `module-section.tsx`/`topic-row.tsx`, `probe.tag.$tagId.tsx` route

**Phase 4** (implemented after Phase 3 — shares files with it, see Implementation Phases table)
22. `/tdd shouldReplenish` + `rankGapsForReplenish` — covers SCENARIO 17, 18, 19, 20
23. `apps/api/src/db/schema.ts`: `probeSessions.curriculumId` nullable, `+ replenishing`; migration
24. `probe-session.generate.ts`: `generateReplenishBatch`
25. `probe-session.service.ts`: replenish trigger + guard in `answerProbeSession`
26. `apps/web`: `probe-session-quiz.tsx` refetch-on-low
27. `apps/bot`: `quiz-flow.ts` refetch-on-low
28. Documentation: new `docs/architecture/grounded-knowledge-map.md`; extend `use-case-study-mode.md` and `topic-study-experience.md`

### Scope boundary

Out of scope: wiring `selfGrade` into any new generation/gap logic beyond its two existing consumers; fuzzy/near-duplicate tag matching (exact-after-normalization only); a general-purpose or multi-hop crawler of any kind; persisting a "rejected" source disposition; retrofitting `rankGapsForReplenish`'s prioritization into the very first quiz batch; any push/websocket delivery mechanism for replenished questions; changing the Subject/Curriculum relationship (verified already sufficient for multi-course-per-technology); any change to the Socratic chat agent's own conversational instructions beyond what's needed for the bot's `/study` reply copy (the "quick test" exception requires no code change — it is the existing, untouched behavior of ephemeral quiz/Socratic interaction against an already-existing curriculum, never a new course-creation path).

### Phase 5 — Conversational curriculum structure shaping (added 2026-07-19)

Ordered after Phase 1, resolved live with the user via `AskUserQuestion`: the user's own words
were "the mechanism of ingestion of sources and hence the mechanism of curriculum shaping needs
to drastically change" — the source-approval panel from Phase 1 (link list → approve → one-shot
generate) becomes a sub-step feeding a new negotiation stage, not a replacement or a parallel path
(user's explicit choice: "Wrap it"). Also explicitly requested mid-build: paste/upload of material
the user already has (an article, or an existing curriculum drafted elsewhere) must remain
supported as a first-class entry point, not be lost in the redesign.

**New status**: `curricula.status` gains `"shaping_structure"`, sitting between
`awaiting_source_approval`/`draft` and `ready`. Reaching `ready` now always means "a human
confirmed this structure in the chat," for every entry point — bare name, docUrl, and pasted
material alike. This closes a real gap: today, pasting text via the existing `sources: [{kind:
"text"}]` field bypasses grounding/approval/review entirely and calls the legacy one-shot
`parseCurriculum` straight to `ready` — that path is being retired in favor of the same
conversational review every other entry point gets.

**Three entry points into structure shaping** (`apps/web/src/curriculum/study-technology-form.tsx`
gains a third mutually-exclusive input alongside name/docUrl — a "paste what you already have"
textarea):
1. **Bare name** or **docUrl** — unchanged Phase 1 candidate-gathering → `awaiting_source_approval`
   → user approves sources (unchanged panel) → THEN, instead of `generateCurriculumFromApprovedSources`
   writing modules/topics directly and setting `ready`, it now produces a *draft* structure and
   lands on `shaping_structure` (see below).
2. **Pasted material** (`pastedMaterial: string`, new field on `createCurriculumInput`) — stored
   immediately as an approved `sources` row (`kind: "text"`, `approvalStatus: "approved"`,
   `fetchedText` = the pasted text). Skips candidate-gathering/approval — the user already brought
   material — and calls the same draft-structure generation directly, landing on
   `shaping_structure`. Precedence: conflicts with `docUrl`/`researchTopic`/`sources` exactly like
   those already conflict with each other today (extend `isResearchAndSourcesConflict`-style
   checks in `curriculum.controller.ts`, don't fork a new validation shape).
3. From inside the chat itself, once already in `shaping_structure`: the user can flag specific
   drafted modules/topics ("not sure about this one") and ask for supplemental research on just
   those — reuses `gatherSourceCandidates`/`gatherTrustedSourceCandidates` scoped to the flagged
   labels, folding fresh grounding text directly into the next regeneration turn (no second
   approval round for this supplemental research — the user already approved entering the chat by
   confirming or pasting; re-approving individual follow-up links mid-conversation is out of scope
   for this phase, logged as a v2 candidate, not built).

**Draft-structure generation** (`generateDraftStructure`, in
`apps/api/src/curriculum/curriculum-structure.ts`, new file) is the concrete mechanism the user
ordered: one architect-agent call that (a) proposes general topics informed by the agent's own
training knowledge for the given subject/name, explicitly personalized via a fixed persona line —
"the learner is a web developer doing increasing amounts of AI/LLM work" — and (b) in the *same*
call, proposes subtopics per topic. This reuses the existing `docResearchArchitect`/
`curriculumArchitect` agents' `modules`/`topics` output shape (a topic list under each module *is*
the subtopic list — no new schema needed), with instructions extended to state the persona and the
two-step reasoning explicitly. Every call — initial draft and every chat-turn regeneration — is
preceded by a **trusted-source web search** via the existing `gatherTrustedSourceCandidates`
mechanism (OpenRouter `web_search` tool, already scoped to "official blogs, established company
engineering blogs, and research papers"); the target list gains the user's explicitly named
examples (OpenAI, Anthropic, Gemini/Google, Vercel) as a documented, non-exhaustive seed list in
the prompt, extending [[project_trusted_sources_requirement]] rather than forking a second
sourcing rule. This satisfies "at every stage of curriculum shaping you must use a web search
tool" — grounding runs on the initial draft AND on every subsequent chat-driven regeneration, not
once at kickoff.

**Chat negotiation**: new table `curriculum_structure_turns` (id, curriculumId, role
`"user"|"assistant"`, message text, structureSnapshot jsonb nullable — populated only on assistant
turns, the full proposed `{modules: [...]}` tree at that point in the conversation — createdAt).
New endpoints: `GET /curricula/:id/structure-turns` (list), `POST /curricula/:id/structure-turns`
(body: `{message: string, researchGapLabels?: string[]}` — appends the user turn, optionally runs
scoped supplemental research per above, regenerates the draft via the architect agent using the
full turn history + current snapshot + any new grounding as context, appends the new assistant
turn), `POST /curricula/:id/confirm-structure` (writes the latest snapshot as real `modules`/
`topics` rows via the existing `saveCurriculumPlan`, sets status `ready` — the same terminal state
every other entry point already reaches, so the pre-assessment redirect (Phase 2) and everything
downstream needs zero changes).

**Frontend**: new `apps/web/src/curriculum/curriculum-structure-chat.tsx` — renders turn history,
the latest draft structure as a read-only module/topic tree with a checkbox per module/topic
("research this more" — checked labels feed `researchGapLabels` on the next send), a message
input, and a "Build this course" confirm button. Wired into
`apps/web/src/routes/curriculum.$curriculumId.tsx` for `status === "shaping_structure"`, the same
slot pattern `SourceApprovalPanel` already uses for `awaiting_source_approval`.

**Study-time budget (added live, 2026-07-19, mid-build):** the draft-structure agent must be told
explicitly that a course is meant to take roughly 4-8 weeks of real study, not months — gathering
unbounded material is a failure mode, not a feature. This constrains `generateDraftStructure`'s
prompt/instructions (a stated target module/topic count proportional to that time budget, not just
the existing "2-7 modules" cap carried over from the single-shot architect) and should be visible
to the user in the chat (e.g. an estimated study-time readout alongside the draft tree) so they can
judge scope directly rather than trusting it blindly. When the user flags additional topics for
research mid-chat, the agent should say so if that risks pushing the course past a reasonable
scope, not silently keep growing it — a chat nudge, not a hard block.

**Tool-calling structure editor (added live, 2026-07-19, mid-build):** the chat's regeneration
step stops being a single "regenerate the whole draft from scratch" structured-output call and
becomes a genuine tool-using agent turn — the user wants to reshape the draft directly through
conversation ("make this topic its own module, and actually that module deserves to be its own
course"), which a single freeform regeneration cannot do reliably or auditably. Follows
`~/webdata/ilya-projects/ai-dev/docs/principles/001-building-agents.md`'s "Tool Design" and
"Agent Loop" sections and `002-ai-agent-mistakes.md`'s #4 (too many tools), #6 (unbounded
iteration), #9 (unrestricted DB access), #17 (human-in-the-loop before autonomous mutation) —
apply all four here, not just the ones convenient to skip.

**Safety boundary — read this before writing any tool:** every tool except one operates ONLY on
the in-memory/DB-stored `structureSnapshot` jsonb blob for the CURRENT curriculum, which is a
pre-confirmation draft — nothing these tools do writes to the real `modules`/`topics` tables.
`confirm-structure` (already specced above) remains the sole, deterministic, non-LLM writer of
real rows, exactly as today. The one exception, `splitModuleIntoNewCourse`, creates a brand-new
`curricula` row (status `shaping_structure`, its own fresh snapshot seeded from the split-out
module) — this is additive-only (a new row), never mutates or deletes anything already confirmed,
so it stays inside the same safety boundary.

**Tool set** (define via Mastra's agent `tools` — this codebase's architect agents have never used
tool-calling before, only structured-output; this is the first one, so get the shape right by
reading Mastra's own tool-definition docs/examples before assuming the API surface):
- `addModule({ title, topics: string[], afterModuleTitle?: string })`
- `removeModule({ moduleTitle: string })`
- `renameModule({ moduleTitle: string, newTitle: string })`
- `mergeModules({ moduleTitles: string[], newTitle: string })`
- `promoteTopicToModule({ moduleTitle: string, topicTitle: string })` — the topic becomes its own
  module in the same curriculum's snapshot.
- `splitModuleIntoNewCourse({ moduleTitle: string, newCourseName: string })` — the one tool that
  touches the DB beyond the current snapshot; creates the new curriculum row as described above
  and removes the module from the current draft's snapshot.
- `suggestSplitIntoCourses({ reason: string, groups: {courseName: string, moduleTitles: string[]}[] })`
  — a PROPOSAL-ONLY tool: records the suggestion in the assistant turn's message/metadata, does
  NOT create anything. Actual splitting only happens if the user confirms in a following chat
  turn, which then drives the agent to call `splitModuleIntoNewCourse` once per group — this is
  the human-in-the-loop gate for a genuinely bigger structural change (multiple new courses),
  matching principle #17.

**Study-time-exceeded → split suggestion:** extends the study-time-budget requirement above —
when a regenerated draft (whether from a chat message or a `researchGapLabels` request) would
put the course meaningfully past the 4-8 week target, the agent should call
`suggestSplitIntoCourses` instead of (or alongside) just noting it in prose, so the user gets a
concrete, actionable grouping to accept or decline rather than only a warning.

**Hard limiters — must be enforced in code, not left to prompt instructions** (per principle #5):
a per-turn cap on tool-call iterations (start at 8 — generous enough for a real multi-step edit,
small enough to make a runaway loop cheap to notice), and every tool call result logged (tool
name + args + resulting snapshot diff) so a stuck or repeating loop is visible in `apps/api`
logs, not just inferred from timeout.

**Frontend**: the chat should render tool-driven turns distinctly from plain conversational ones
— e.g. a compact "→ split 'Security' into its own module" action line inline in the turn history,
not just the prose the agent also returns — so the user can see exactly what changed, not just
read a paragraph and trust it matched what they asked. When `suggestSplitIntoCourses` fires,
render the proposed groups with an explicit confirm/decline affordance (buttons are fine — this
does not need to be pure free-text chat).

**Scope boundary for Phase 5**: no second approval round for supplemental in-chat research links
(logged above); no limit on chat turn count; no editing a drafted topic's title/summary by hand
in this phase (only whole-module/topic flag-for-research and free-text chat steering) — direct
inline editing of the draft tree is a natural v2 but adds a second interaction surface this phase
doesn't need to ship with; the legacy `parseCurriculum`/`sources`-array-only path is retired for
new curricula (its code can stay for now as the retry/merge-flow's plumbing where already used
elsewhere in the file, but the web form no longer exposes a way to reach it directly with pasted
text).

**Definition of Done — Phase 5**:
- Backend: `npx vitest run` clean; a live `curl` sequence — create via `pastedMaterial` lands on
  `shaping_structure` with a stored assistant turn carrying a non-empty `structureSnapshot`; a
  bare-name creation still passes through `awaiting_source_approval` → approve-sources → also
  lands on `shaping_structure` (not `ready`) with a snapshot; `POST .../structure-turns` with a
  message appends both a user and a new assistant turn and the snapshot changes; `POST
  .../confirm-structure` writes real `modules`/`topics` rows and flips status to `ready`.
- Frontend: a manual/Playwright browser check creating a curriculum via the paste textarea,
  confirming the chat UI renders the draft tree and turn history, sending one chat message and
  seeing a new assistant turn render, and clicking confirm to reach the normal topic-list view.
- No regression: Phase 1-4 DoD checks above still pass — approve-sources still gates on ≥1
  approved source, pre-assessment redirect still fires after structure confirm, tag/replenish
  mechanisms untouched.

### Definition of Done

**Frontend.** This repo has a registered Playwright e2e suite (`e2e/README.md` — test content lives in a sibling `verification-repo`, this repo's `npm run dev:pw` drives it end-to-end, including an existing `mock-docs-site` fixture directly relevant to Phase 1's crawl/approval flow). Real proof, one per phase:
- Phase 1: an e2e run (or, if e2e authoring is out of this build's cycle, a manual browser check against `npm run dev`) that creates a curriculum by bare name against the mock docs site, confirms the curriculum lands on the approval screen with ≥1 candidate shown (not `ready`, not modules already generated), removes one candidate, adds a manual link, clicks approve, and confirms modules/topics are generated only after that click.
- Phase 2: a browser check confirming a freshly confirmed curriculum routes to the pre-assessment screen before any topic page is reachable, and that clicking "Start studying" without grading every topic still proceeds.
- Phase 3: a browser check confirming a tag attached to modules/topics under two different curricula produces a study session whose questions visibly span both.
- Phase 4: a browser check (or scripted quiz run) confirming that answering down to 10 remaining questions results in more questions being answerable without a page reload, observed via network tab or an added test hook — not a self-declared "should work."

**Backend.** Real `vitest` runs (`npx vitest run` per workspace, non-watch) plus real `curl` checks against a running local API for the new endpoints:
- Every new deriver (`extractSameSiteLinks`, `dedupeSourceCandidates`, `normalizeTagName`, `shouldReplenish`, `rankGapsForReplenish`) has passing unit tests asserting business outcomes, not booleans.
- `curl -X POST localhost:<port>/curricula` with a bare `researchTopic` (no `docUrl`, no `sources`) returns a curriculum that, on a subsequent `GET`, shows `status: "awaiting_source_approval"` with ≥1 pending source row — not `status: "ready"` with modules already present.
- `curl -X POST localhost:<port>/curricula/:id/approve-sources` with zero approved and no override flag returns a 4xx, never a 2xx that proceeds to generation.
- `curl -X POST localhost:<port>/probe-sessions` with `{ scope: "tag", scopeId: "<tagId>" }` for a tag known to span two curricula returns a session whose questions include topics from both.
- `curl` a session down to 10 remaining (scripted answer loop) and confirm `GET /probe-sessions/active` subsequently reflects a higher `total` without a client-triggered "generate more" call.

**Infrastructure.** N/A for cloud/deploy infrastructure — no new service, queue, or env var. The one infrastructure-adjacent proof: the Drizzle-generated migration(s) for this plan apply cleanly against a local dev database via the existing `npm run db:migrate:api` script with zero manual SQL editing, verified by actually running that command against a local Postgres instance, not by inspecting the generated SQL alone.
