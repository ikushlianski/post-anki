## Decision needed

Planning for #26 ("No response causes no guilt or follow-up") surfaced one real fork. It has a
recommendation below so the rest of the plan can proceed, but it deletes a shipped, user-visible
feature and a DB table — hard to undo, and a product tradeoff #26 never explicitly weighs — so it
is not defaulted silently.

---

### Does the dashboard streak counter get removed, or does #26's "no streak" criterion get scoped to the bot only?

**What exists today:** `packages/core/src/streak/streak.ts` (`updateStreak`), a full
`apps/api/src/streak/` module (repo/service/controller), a `user_streaks` Postgres table
(`schema.ts:581`, migration `0012_wooden_silver_samurai.sql`), a `GET /streak` endpoint, and
`apps/web/src/curriculum/streak-banner.tsx` — a 🔥-emoji "X day streak / Longest · Y days" banner
on the web dashboard (`apps/web/src/routes/dashboard.tsx`), with an explicit shame state when the
streak is 0: "No streak yet — answer a question today to start one." It was shipped deliberately
as part of `.planning/study-stats-dashboard/` (state: confirmed), not left over by accident.

**Why this can't be defaulted:** #26's acceptance block states flatly "No streak tracking exists
anywhere in the system (not in DB, not in UI)" — but #26 is framed entirely around the Telegram
bot's response to silence (its "Situations this covers" section is all Telegram scenarios). The
dashboard streak counter is a separate, already-shipped web feature with its own approved spec.
Removing it drops user-visible functionality Ilya may still want on the dashboard even while
agreeing the *bot* should never mention streaks or gaps in days. No default here is safe: keeping
it violates #26's literal acceptance criterion; removing it deletes a confirmed, shipped feature
based on one story's acceptance line potentially over-reaching its own stated scope.

**Options:**
1. **Remove the streak feature entirely** (core deriver, API module, `user_streaks` table via a
   generated drop migration, web banner, dashboard loader wiring) — satisfies #26's acceptance
   criterion literally. The dashboard loses the streak banner; nothing else changes since no other
   surface reads streak data (confirmed: no Playwright/e2e coverage references `streak-banner`,
   `streak-current`, or `streak-longest`).
2. **Keep the dashboard streak feature, scope #26's "no streak" criterion to the bot/Telegram
   surface only** — amend #26's acceptance text (or note the scoping explicitly in this repo's
   planning docs) to read "no streak tracking in the bot's messages," leaving the opt-in dashboard
   view (a page the user has to navigate to, not a push notification) as a separate, still-shipped
   feature. Zero code change for this ticket.

**Recommendation:** option 1 if the product intent behind #26 is genuinely "no gamification/guilt
mechanics anywhere in this app" (which its wording suggests — "no streak tracking exists anywhere
in the system"); option 2 if the intent was specifically about the bot's proactive messages and the
dashboard's opt-in streak view was always meant to stay. Leaning toward option 1 on a literal
reading of the acceptance text, but this is Ilya's call given it reverses a separate, already-
approved feature decision.
