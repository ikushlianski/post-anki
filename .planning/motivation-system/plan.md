# Motivation system beyond levels and badges

## 1. What exists today (Facts, from code)

- Points: 1 point per review (`packages/core/src/gamification/review-points.ts`). Level curve is quadratic, 50 * (level-1) * level (`player-level.ts`). Level chip, profile page, badge grid and a "+N points this session" banner (`apps/web/src/gamification/`).
- Badges: tiers for streak (3/7/30/100), mastered cards (1/10/50/200, mastered = interval >= 21 days), per-subject depth (25/100/500), total reviews (100/1000/5000) (`packages/core/src/gamification/badges.ts`).
- Streak: one global row (`user_streaks`, id "singleton"); consecutive calendar days, any gap resets to 1. No freeze, no repair, no timezone (date is the UTC slice of the timestamp) (`packages/core/src/streak/streak.ts`, `apps/api/src/streak/`). Streak recording is already planned for Anki-style reviews (`.planning/classic-anki-review/14-persist-daily-streak/plan.md`).
- Daily review count lives only in browser localStorage (`apps/web/src/knowledge-bit/daily-review-storage.ts`); the server has per-day point events (`review_point_events`, with awarded day) which can answer "how many reviews today".
- Subjects are a tree (`parent_id`, `sort_order`, `learning_intent`) with no goal or priority fields. Topics/domains have a `priority` column, but that is course content, not the learner's personal focus.
- The review API already accepts a `tz` (time zone) field (`packages/shared/src/knowledge-bit-review.ts`), so time zone is partly modeled.
- Gap (Fact): nothing today expresses a goal. Everything is rewards for what already happened; nothing says what the learner is aiming for.

## 2. Research summary

Labelled Fact (sourced) or Assumption. Search coverage was thin in places; gaps are stated.

- Streak forgiveness. Fact (secondhand summaries of Duolingo's retention team, via Lenny's Newsletter): Duolingo ran 600+ streak experiments, treats streaks as loss aversion, and added the Streak Freeze (max 2 held) because fear of breaking a streak can stop people starting one. Retention is most fragile in the first 7 days. Letting users pick a streak goal (opt-in ownership) raised retention. The "10-day streak users churn less" finding is correlational with selection bias, per the same summaries. I could not reach Duolingo's own blog post. Links: https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks , https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model
- Anki-user expectations. Fact: the popular Review Heatmap add-on counts any day with at least one review toward the streak, and shows a calendar heatmap plus daily average (https://github.com/glutanimate/review-heatmap , https://github.com/glutanimate/review-heatmap/wiki/Use). One AnkiWeb forum user wants the streak tied to a minimum goal rather than 1 card (https://forums.ankiweb.net/t/anyone-have-add-on-ideas/11988/63). Assumption: Anki users want honest, quiet statistics (heatmap, retention, forecast), distrust cartoonish rewards, and dislike backlog guilt. I found no source on backlog pressure.
- Points, levels, leaderboards and intrinsic motivation. Fact: evidence is mixed. Mekler et al. 2013 found points/levels/leaderboards raised output with no harm to intrinsic motivation in a short voluntary task (https://hcds.itu.dk/bibliography/mekler2013points). Hanus and Fox found lower satisfaction and motivation when badges were mandatory and leaderboards invited comparison (summary: https://gamification-research.org/2014/08/gamification-considered-harmful/). No meta-analysis directly settling overjustification for learning apps was found. Takeaway (Assumption): keep rewards optional, never compulsory, and avoid ranking the user against others.
- Goal setting. Fact (weak sources only): Locke and Latham's theory says specific, challenging goals beat vague ones, and large goals are broken into sub-goals. The search returned only low-quality copies, so cite the original papers before relying on it. Assumption: progress visibility ("small wins", Amabile and Kramer) and session-end closure (Zeigarnik / peak-end) are well-known, but I could not verify them in this search; treat as design heuristics, not proven effects.
- Variable rewards. Assumption: unpredictable rewards drive compulsion more than learning. For a single-user, long-horizon study tool, use sparingly and only on genuine achievements (surprise insight, "you recalled something from 6 months ago").
- Social/competition. Assumption: this is a single-user product today (singleton streak row, no accounts-to-accounts model), so competition is out of scope; optional private "past self" comparison substitutes.

## 3. Product changes in plain language

1. Goals first. The learner sets, per subject: a daily number of reviews and a daily number of new pieces of knowledge to add (either can be left off). Plus optional priorities by horizon: a few subjects marked as this year's, this month's, and this week's focus. Priorities are the learner's own statement of "what matters", not computed.
2. Today card. The home screen shows one "Today" panel: reviews done vs goal per subject, adds done vs goal, and what is left, with the week and month focus subjects pinned first. Daily goals of the focus subjects count toward a combined "today is done" state.
3. Forgiving streak. The streak counts a day when the learner meets that day's goal (or a small minimum if no goal is set; a floor of a few reviews, user-adjustable). Missed days are absorbed by a limited number of automatic "rest days" (for example 2 per rolling month, earned back by consistency, plus a manual "pause" for travel or illness). A broken streak shows "best: N, restart" rather than a zero; a "comeback" message replaces shame. Streak shown as a rolling "active days in the last 30" alongside, which does not reset.
4. Progress that means something. Replace pure point totals as the headline with: cards moving into "mastered", retention of older cards (percent still remembered after 30+ days), and per-subject growth over the week and month, with a calendar heatmap. Points and levels stay, but demoted to a small secondary element.
5. Mastery framing. Per-subject "how much of this subject do I own" bar based on mastered vs total cards, and a "this week you made N cards solid" line. Goal progress is described as competence gained, not obligation.
6. Session closure. End of every review session shows: done vs goal, the one thing improved (for example "12 cards now solid"), tomorrow's preview ("18 due, about 6 minutes"), and a clear stopping point ("You're done for today; more is optional"). When the goal is exceeded, show the extra as bonus, not a new bar to chase.
7. Rare, meaningful surprises. Occasionally resurface an old card the learner got right after a long gap, or a milestone like "first card from this subject mastered". Capped (at most one a day), no random loot.
8. Weekly and monthly review. A short weekly summary: goals hit, focus-subject progress, and a prompt to re-pick next week's priorities. Month and year views use the same data.
9. No social/competition in this phase. Optional "vs my last month" comparison only.

## 4. Data and API changes

Architectural boundaries:
- New module "goals": owns goal targets and priority horizons per subject. Owns writes; other modules read.
- Streak stays in its module, but its rule changes from "any activity" to "day qualified" and gains rest-day state. Gamification stays the aggregator that builds the profile; a new "today progress" read model composes goals + review events + add events.
- Time zone becomes a stored user setting (single value), used by streak, daily goal and "today" boundaries. Today the UTC date is used, which makes late-evening reviews land on the wrong day for non-UTC users (Fact: UTC slice in `streak.service.ts` and `gamification.service.ts`).

Data (new, via generated migration and the existing migrate script):
- Subject goals: subject id, daily review target (nullable), daily add-knowledge target (nullable), effective-from date. Keep history rows so past days are judged against the goal that was active then.
- Subject priorities: subject id, horizon (week, month, year), period key (for example 2026-W44, 2026-10, 2026), rank. One subject can hold different horizons.
- Daily activity ledger: date, subject id, reviews done, knowledge pieces added. Reviews can be derived from existing point events; adds need a new counter or a count query over knowledge bits by created day. Prefer queries over a new ledger first; add a ledger only if the queries get slow.
- Streak state: add rest days available, rest days used, paused-until date; keep current and longest.
- User settings: time zone.

API:
- Goals: read and write goals per subject; read and write priorities by horizon.
- "Today" read: per subject goal progress, combined done state, focus subjects, streak with rest-day info.
- Session summary: extend the end-of-session response with goal progress, newly solid cards, tomorrow's due count and estimate.
- Progress read: mastered count over time, retention of older cards, per-subject weekly and monthly deltas for the heatmap. Date-range queries over existing review events.
- Existing profile endpoint keeps working; new fields are additive.

Client: today panel, goals screen (per-subject, plus priorities by week/month/year), streak display with rest days, richer session-end screen, heatmap. Daily review count in localStorage is replaced by the server read so the number agrees across devices.

## 5. Slices to build (each shippable alone)

1. Time zone setting and server-side "today" boundary. Fix streak day calculation. Smallest, unblocks everything. Also confirm the Anki review path records the streak (slice 14 plan).
2. Subject daily goals (reviews and adds) and the Today panel on home. Server-derived counts replace localStorage.
3. Streak v2: qualifies-by-goal, rest days, pause, "best / comeback" display. Needs a decision on migrating existing streak (keep current value, apply new rules going forward).
4. Session-end closure: done vs goal, newly solid cards, tomorrow preview, clear stop point.
5. Progress visibility: heatmap, per-subject mastery bar, weekly delta, retention of older cards.
6. Year/month/week priorities and the weekly review prompt; Today panel pins focus subjects.
7. Rare surprises (capped resurfacing of old correct cards) and weekly/monthly summary.
8. Demote points/levels in layout; adjust badges toward goal and mastery outcomes (for example "goal met 20 days", "subject 50 percent solid") rather than raw counts.

Suggested order: 1, 2, 4, 3, 5, 6, 7, 8. Goals plus closure deliver the most value early; the streak rewrite waits until goals exist so it has something to qualify against.

## 6. Risks and open decisions

- Streak anxiety. Goal-bound streaks can punish the learner for a heavy-backlog subject. Mitigation: rest days, pause, goal can be zero or off, and goals must never auto-increase.
- Goal sprawl. Goals per subject across many subjects overwhelms. Mitigation: default to the combined goal on focus subjects only; non-focus subjects have no daily goal unless the learner adds one.
- Goal-driven cheapness. A daily "add knowledge" target can push low-quality adds. Mitigation: count only approved pieces, not drafts, and keep the target optional. This interacts with the existing approval flow (confirm which status counts).
- Retroactivity. Changing a goal must not rewrite past days (hence effective-from history).
- Evidence quality. Several motivational claims above are Assumptions or weakly sourced; before slice 7 and 8, treat as experiments, and keep reversible toggles in the admin settings.
- Single-user assumption. The streak is a singleton row. If multi-user arrives, goals, streak and time zone all need an owner key; slices 1-3 should add that key now if multi-user is plausible (decision for the owner).
- Cost. None of this needs the model; all reads are database queries. Retention and mastery queries over review events may need an index or a nightly rollup at larger volume.
- Migrations: generate and run through the existing migrate script, never push directly.

## 7. Dependencies

No new dependency required. The heatmap can be drawn with existing styling and plain markup. If a charting or heatmap library is wanted, it is a proposal to approve against `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md`, not decided here. Date and time zone handling should use the platform `Intl` support already used in the shared review schema.

## 8. Not decided here (for the owner)

- Rest-day allowance numbers (2 per month is a starting guess, not evidence-based).
- Whether the adds goal counts approved pieces only or all captured pieces.
- Whether the minimum-activity floor for subjects with no goal is 1 review (Anki-style) or a small number like 5.

END-OF-REPORT
