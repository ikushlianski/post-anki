---
type: discussion
branch: doc-changelog-scan
task: Periodic doc/changelog scan — new-topic + supersession suggestions (issue #49)
updated: 2026-07-28
---

# Discussion log — unattended planning run

No human present. Every fork below was resolved via direct codebase reading, not guessed. Full
reasoning lives in `spec.md`'s "Decisions made autonomously" — this log is the short version plus
what was checked and found.

## 1. Does this reuse `domain_priority_suggestions` (item 7's seam)?

Read `apps/api/src/domain-map/domain-priority-review.orchestrator.ts`,
`apps/api/src/db/schema.ts`, and `.planning/domain-priority-review/architecture.md` (which
literally draws `doc-scan` as this item's future seam). Checked the actual row shape:
`domain_node_id` is `NOT NULL` (must reference an existing node) and the payload is
`suggested_target_depth` (a depth-ceiling change). Issue #49 needs two different outputs: (a)
propose a **brand new node** — no node id exists yet — and (b) **flag** an existing node, not
change its depth ceiling. Neither fits the row. Verdict: reuse the **review-screen UX pattern**
(pending list, accept/reject, `resolved_at`, `source` discriminator) but give this item two of its
own sibling tables, not a forced fit into `domain_priority_suggestions`.

## 2. "Percentage visibly drops" vs. "No passive maturity decay"

`.product/PRINCIPLES.md`: "Concept maturity only changes on interaction — it never degrades over
time automatically... After 90 days without interaction, concepts get an 'Unverified' visual tag —
not a penalty." `domainNodeProgress()` (`packages/core/src/domain-map/domain-map-progress.ts`) is
also a pure derived rollup from real topic-progress rows — nothing in the write path can set
`percent` directly regardless of principle. A cron that lowers it automatically would be exactly
the forbidden passive decay. The wishlist's own wording offers "reduce/flag" — chose **flag**: a
new nullable `superseded_at`/`superseded_reason` marker on `domain_nodes`, written only when the
**user accepts** a supersession suggestion (an interaction, not automatic decay), rendered as a
badge beside the unchanged percent. Documented plainly as a reinterpretation, not silently.

## 3. Scheduling

`infra/index.ts` already runs a live `gcp.cloudscheduler.Job` (`dailyPushJob`) — real, deployed
scheduler infra, contradicting the initial framing that none exists. Issue #49's Done-when says
"gets scanned **on a schedule**" (item 7's Done-when never used that word, which is why item 7
correctly stayed manual-only). Verdict: add a second `gcp.cloudscheduler.Job` targeting a new API
endpoint, following `dailyPushJob`'s exact shape. Found two real blockers this creates: the API's
`API_SHARED_SECRET` is currently CI-owned only (`.github/workflows/deploy.yml`), not in Pulumi
config, so a new `pulumi config set --secret apiSharedSecret <value>` is a one-time human
prerequisite (same pattern as `telegramWebhookSecret`/`electricDatabaseUrl` already are); and
`dailyPushJob`'s `attemptDeadline: "60s"` is too short for multi-tool fetch + one LLM call, so the
new job gets `attemptDeadline: "300s"`.

## 4. Fetch mechanism

`doc-link-grounding.ts`'s `probe()`/`truncate()` (fetch-with-timeout + char-cap) is the right
primitive — tracked tools have known URLs, so no need for `tech-research-grounding.ts`'s
web-search-based approach (that's for when the URL itself is unknown). Both are module-private;
extracting them into a small shared helper is a pure refactor, `doc-link-grounding.test.ts` (if
any) or its integration coverage must keep passing unchanged.

## 5. Dedup / "never a firehose"

Item 7 had no separate "run" table because its trigger was manual/one-shot. A recurring cron
cannot inherit that — without a persisted per-tool watermark, the same release re-surfaces every
week forever. Added `tracked_tool_scan_state` (tool_key → last_content_hash, last_scanned_at); the
orchestrator only calls the LLM for tools whose fetched content hash changed since last run. Zero
changed tools → zero agent calls, zero new rows. This is also the concrete "not a firehose" proof
(SCENARIO 3).

## 6. Tracked tools

Hardcoded starter list of 4, real URLs verified reachable via `curl` at planning time (200 OK for
all): Next.js, TypeScript, React Router (Remix's routing successor — Remix itself merged into
React Router v7 in Nov 2024, so tracking React Router's releases is the accurate choice over a
now-dormant standalone Remix repo), TC39 proposals. `apps/api/src/admin-settings/` is real but
currently a single boolean (`testToggle`) — can't hold an array without its own schema change, so a
user-editable tracked-tools list is named as a follow-up, not built here.

## 7. Notification channel

Bot's `POST /push` (`apps/bot/src/server.ts`) is the one existing Telegram channel, and extending
it would add a second cross-service integration beyond this item's core mechanism. Chose: v1 posts
no new Telegram message — suggestions surface passively on the extended priority-review screen,
zero notifications trivially satisfies "no more than a small bounded number per cycle." Issue #11's
original "weekly Telegram digest" is named as the natural, cheap follow-up once this mechanism
exists.

## 8. Agent-failure posture — the opposite of item 7's, for the opposite reason

Item 7's review trigger is foreground/user-waited-on, so it throws visibly (502). This item's
primary trigger is a **scheduled, unwatched background job** — nobody is looking at the response
when Cloud Scheduler fires it. Chose the *other* existing precedent instead:
`domain-placement.orchestrator.ts`'s silent-fallback posture — log the error, return an empty
result, 200 OK, watermark for the tools that were mid-call stays un-advanced so they're retried
next run. The manual "Scan now" button (added for e2e-testability and immediate feedback) hits the
exact same orchestrator and gets the exact same graceful-empty-result behavior on failure — no
special-casing between scheduled and manual callers.
