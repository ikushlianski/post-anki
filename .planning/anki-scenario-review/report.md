# Review: paste text -> suggested knowledge items -> approve -> Anki-style review

Branch: learn-from-doc-site. Read-only review. R = /Users/ikushlianski/webdata/ilya-projects/post-anki. All claims below are Fact (read in source) unless marked Assumption. Nothing was run; wiring was verified by reading code, not by executing the app.

## Verdict

What works today: you can paste text, it is split by an LLM into "knowledge bits", you see them on a review page with a generated question and answer, you Approve or Reject, and approved bits are served as questions on an "Answer knowledge bits" screen where you type an answer and get a spaced-repetition schedule update.

What does NOT work like Anki: review is not "show front, reveal back, press Again/Hard/Good/Easy". You must type a free-text answer, an LLM grades it (Ok / NeedsReview / NeedsDeepDive), and the reference answer is never shown. The default review queue also ignores due dates. So: the paste -> suggest -> approve half is supported (with caveats); the "classic Anki mode" half is PARTIAL at best and differs in core ways.

Three blockers for a real user today:
1. After pasting, nothing triggers detection locally. The pipeline runs only via 7 separate POST scan endpoints that exist as GCP Cloud Scheduler jobs in production (every 5 min). On a local dev run you must call them by hand.
2. The approval page `/knowledge-bit-review` exists but has no link in the sidebar or anywhere else; you must type the URL.
3. The answer screen prints the bit's full text (the answer) above the question, so free recall is spoiled.

## Step 1: User pastes raw text — SUPPORTED

- Fact: Route `/add-knowledge` with a textarea per block, optional "Add link" URL mode, multi-block submit: R/apps/web/src/routes/add-knowledge.tsx:5-20, R/apps/web/src/knowledge-source/add-knowledge-form.tsx:48-124.
- Fact: Sidebar links to it: R/apps/web/src/nav/sidebar.tsx:22.
- Fact: Web calls `POST /knowledge-sources` ({text}, {texts[]} or {url}): R/apps/web/src/curriculum/api-client.ts:580-588. Route registered at R/apps/api/src/router-table.ts:17, handler R/apps/api/src/knowledge-source/knowledge-source.controller.ts:19-106 (max 50,000 chars per text, line 12; trims, rejects empty).
- Fact: Persisted to `knowledge_sources` with status "pending": R/apps/api/src/db/schema.ts:1069-1096.
- Gap (Fact): The UI only says "Knowledge source added." There is no progress or status display and no pointer to the review page: R/apps/web/src/knowledge-source/add-knowledge-form.tsx:107-111; spec confirms this was out of scope: R/.planning/add-knowledge-screen/spec.md (Scope boundary).

## Step 2: System parses it into Knowledge items and suggests them — PARTIAL (works, but not triggered automatically outside prod)

- Fact: Detection is an LLM agent (cheap model tier) that splits prose into 1-20 self-contained bits with optional `background`; source text is treated as untrusted in the prompt: R/apps/api/src/mastra/knowledge-bit-detector.agent.ts:11-71, 83-110.
- Fact: Orchestrator claims pending sources (max 20 per run), rejects empty or >50,000 chars, inserts bits and marks source "bits_detected" in one transaction, failures marked "failed" with a reason: R/apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:9-11, 49-77, 82-118; insert R/apps/api/src/knowledge-bit/knowledge-bit.repo.ts (insertKnowledgeBitsAndMarkDetected, near line 150).
- Fact: Bits are stored in `knowledge_bits` with `approvalState` default "pending": R/apps/api/src/db/schema.ts:1099-1111.
- Fact: Detection is NOT triggered by the paste request. It runs only when `POST /knowledge-sources/detect-bits` is called: R/apps/api/src/router-table.ts:19, R/apps/api/src/api-server.ts:389-390.
- Fact: The only automatic caller is Cloud Scheduler, default every 5 minutes: R/infra/index.ts:40, 440-456. The same file schedules embed (line 41), tag (42), place (43), question-gen (44), fill-blank-gen (46), variant-embed (48) as separate jobs (R/infra/index.ts:458-565).
- Fact: I found no in-process timer or dev-script trigger (grep for setInterval/node-cron in apps/api/src returned nothing outside tests; R/scripts/dev.sh only starts Postgres, migrates, runs api+web).
- Assumption: A local-dev user therefore sees no suggestions until they curl the scan endpoints (`/knowledge-sources/detect-bits`, then `/knowledge-bits/question-generation-scan` and `/knowledge-bits/fill-blank-generation-scan` at minimum). If `API_SHARED_SECRET` is unset the API skips auth (R/apps/api/src/api-server.ts:280-285), so plain curl works locally.
- Fact: The LLM needs `OPENROUTER_API_KEY` (required): R/apps/api/src/shared/env.ts:5.
- Fact: Question/answer pairs are generated for bits that are still pending (not only after approval), so they are visible at review time: R/apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.ts:23-40 (filter is `approvalState != rejected`). Two variant kinds exist: `wh_question` (open why/how question) and `fill_in_the_blank`: R/apps/api/src/db/schema.ts:1178-1210.
- Gap: Question generation is a second async step after detection, so a bit can appear on the review page with no variants yet; the UI disables Approve until at least one variant exists (R/apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx:104-114, 255-258). The page does not auto-refresh (loader runs once: R/apps/web/src/routes/knowledge-bit-review.tsx:6-9).

## Step 3: User approves or rejects — SUPPORTED (page not discoverable)

- Fact: Page `/knowledge-bit-review` lists pending bits grouped by source, shows source text, each bit, its generated question/answer variants; supports edit of bit, edit of a variant, Approve, Reject: R/apps/web/src/routes/knowledge-bit-review.tsx, R/apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx:24-190, R/apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx.
- Fact: Wired to `GET /knowledge-bits/pending-review`, `POST /knowledge-bits/:id/approve|reject`, `PATCH /knowledge-bits/:id`, `PATCH /knowledge-bits/question-variants/:id`: R/apps/web/src/curriculum/api-client.ts:500-527, R/apps/api/src/router-table.ts:62-98, handlers R/apps/api/src/knowledge-bit/knowledge-bit-approval.controller.ts:15-80.
- Fact: Approve/reject write `approvalState`; a decision cannot flip to the opposite one: R/apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:14-38.
- Fact: Everything learner-facing is gated on `approvalState = approved` (`bitApproved`): R/apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:12, used in the queue at R/apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts:157-159, and grading rejects non-approved: R/apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts:26-28.
- Gap (Fact): No navigation link to `/knowledge-bit-review`. The sidebar has only Dashboard, Answer knowledge bits, Add knowledge (R/apps/web/src/nav/sidebar.tsx:13-24); a grep for the path in web/src finds only the route file itself and its panel testids. It is registered in the route tree (R/apps/web/src/routeTree.gen.ts:94-95), so the URL works.
- Gap (Fact): Rejected bits are not deleted and there is no bulk approve; each bit is approved one by one. Pending list capped at 200: R/apps/api/src/knowledge-bit/knowledge-bit-approval.controller.ts:10.

## Step 4: Approved items become flashcards reviewed Anki-style — PARTIAL (a different, quiz-like mode)

What exists (Fact):
- Route `/knowledge/answer` ("Answer knowledge bits"), linked from the sidebar (R/apps/web/src/nav/sidebar.tsx:19) and from dashboard "most pressing topics" (R/apps/web/src/routes/index.tsx:199-208): R/apps/web/src/routes/knowledge.answer.tsx.
- It fetches `GET /knowledge-bits/question-variants/next` (batch of 5) and posts answers to `POST /knowledge-bits/question-variants/:id/answers`: R/apps/web/src/knowledge-bit/knowledge-answer.api.ts:12-25, R/apps/web/src/curriculum/api-client.ts:1677-1740, R/apps/api/src/router-table.ts:57, 73.
- Grading: an LLM (cheap tier) compares your typed answer to the stored reference answer and returns score 0-10, verdict Ok/NeedsReview/NeedsDeepDive and feedback: R/apps/api/src/mastra/knowledge-bit-answer-grader.agent.ts:12-37, 61-66; verdict enum R/packages/shared/src/practice.ts:21.
- After grading, the attempt is stored (append-only) and the bit's schedule is updated in the same request: R/apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts:37-63; tables R/apps/api/src/db/schema.ts:1213-1239.
- Free recall without options: yes. The learner types an answer into a textarea, no multiple choice: R/apps/web/src/routes/knowledge.answer.tsx:122-127.

What is missing or wrong versus the scenario:
- No reveal step and no self-grading. There is no "Show answer" button and no Again/Hard/Good/Easy buttons; the screen only has Submit (needs non-empty text, line 132) then Next: R/apps/web/src/routes/knowledge.answer.tsx:120-155. You cannot answer "I don't remember" except by typing something.
- The reference answer is never shown. After grading, only verdict, feedback and an optional follow-up question render: R/apps/web/src/routes/knowledge.answer.tsx:140-156.
- Spoiler: the full bit text (the fact being tested) is printed above the question: R/apps/web/src/routes/knowledge.answer.tsx:112.
- Each answer needs 2 LLM calls (grade + follow-up generator) plus tag lookup, so review costs tokens and needs network/API key: R/apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts:30, 52-63.
- The default queue does not follow due dates. Order is "fewest attempts first, then oldest", a cycling fair queue; due-rank sorting applies only when filtered by `topicId`: R/apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts:88-99, 173-177. The file's own comment states "No scheduling state, no due list". The sidebar link opens the unscoped queue, so a card scheduled for 10 days out can come straight back, and an "Again" card does not come back sooner.
- Due counts exist but only for bits placed in a topic of a confirmed curriculum: R/apps/api/src/knowledge-bit/topic-due.repo.ts:23-55 (requires approved, has a variant, `topics.included`, curriculum status confirmed). Ad-hoc pasted bits with no topic placement never show up in the dashboard "due" list, though they do appear in the unscoped queue (the queue's topic filter treats null topic as allowed: knowledge-bit-question-variant.repo.ts:133).
- Fact: A bit with only a placement-less status can be placed by a separate placement scan with its own accept/reject UI (R/apps/web/src/knowledge-bit/placement-suggestions-panel.tsx, router-table.ts:52-67). This is an extra step not in the simple scenario.
- Card granularity: one schedule row per bit (R/apps/api/src/db/schema.ts:1228-1236), but cards shown are per variant (up to 2 per bit: wh_question and fill_in_the_blank). Answering either variant updates the same bit schedule, and `reviewCount` increments per answered variant: R/apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts:59-98.
- Intent mismatch (Fact): the question generator prompt explicitly says the question "is not a spaced-repetition flashcard drill ... not a keep-everything Anki-style card": R/apps/api/src/mastra/knowledge-bit-question-generator.agent.ts:15-18. Cards are meant to probe "why", not to be recall flashcards (front/back facts). The "front" is a Wh-question requiring reasoning, and the "back" is a model answer in the LLM's own words.
- No mobile or bot review path for bits found: no references to knowledgeBit in R/apps/mobile or R/apps/bot (grep). Assumption: review is web-only today.

## Differences from Anki

| Aspect | Anki | This app (Fact) |
|---|---|---|
| Card faces | Front, press to reveal back | Question + textarea; back (reference answer) never displayed (knowledge.answer.tsx:112-156) |
| Grading | You self-grade Again/Hard/Good/Easy | LLM grades typed answer into Ok/NeedsReview/NeedsDeepDive (answer-grader.agent.ts:12-37) |
| Scheduler | SM-2-like (v2) or FSRS (modern), learning steps in minutes | Simplified SM-2, 3 outcomes, no FSRS (knowledge-bit-schedule.repo.ts:21-53) |
| First interval | Learning steps then 1 day | First Ok = 2.5 days (1 x ease 2.5); fail = 1 day; no minute-level relearning (schedule.repo.ts:6-14, 24-53) |
| Ease | 1.3 minimum, no cap | 1.3 to 3.0 cap, Ok +0.1, NeedsReview -0.05, fail -0.2; intervals 1-180 days, NeedsReview capped at 14 days |
| Due-driven queue | Shows only due cards, new-card limits | Unscoped queue ignores due date; due ordering only with topicId (question-variant.repo.ts:173-177) |
| Granularity | One note -> cards | Bit -> up to 2 variants, one schedule per bit |
| Deck/stats | Decks, counts of new/learn/due | Dashboard due counts only for topic-placed bits in confirmed curricula (topic-due.repo.ts:23-55) |
| Offline/cost | Local, free | Needs OpenRouter calls per answer |
| Card source | You author cards | LLM-authored Wh-question and fill-blank per bit, editable at review time |

## Gaps to close for this scenario (most important first)

1. Add a real Anki review mode: show the question only, a "Show answer" button that reveals the reference answer, then Again/Hard/Good/Easy self-grade buttons that feed the existing scheduler. Today's typed-answer plus LLM-grade flow is a different feature. Requires mapping 4 grades onto the 3-verdict `computeNextSchedule` (knowledge-bit-schedule.repo.ts:24) or adding a new input path.
2. Make the review queue serve due cards. The unscoped `/knowledge/answer` queue must filter to `dueAt <= now` (or never-reviewed) and order by due date; today it ignores the schedule (question-variant.repo.ts:173-177). Also decide whether to show new-card limits.
3. Stop showing the answer above the question (knowledge.answer.tsx:112), at least in Anki mode.
4. Auto-run the pipeline after paste. Either call detection plus question generation right after `POST /knowledge-sources`, or add a dev timer, or document and script the manual scan calls; production already has a 5-minute scheduler (infra/index.ts:40, 440-565) but local does not.
5. Link the approval page (`/knowledge-bit-review`) from the sidebar and from the add-knowledge success message; show a count of pending bits and per-source status (pending/processing/bits_detected/failed with `failureReason`, schema.ts:1069-1096).
6. Auto-refresh or poll the review page so bits whose questions are still generating become approvable (knowledge-bit-review.tsx:6-9; item.tsx:255-258).
7. Make pasted bits reviewable without topic placement in dashboard due counts, or explain that due badges require a confirmed curriculum (topic-due.repo.ts:23-55).
8. Optional: add bulk approve; add `fill_in_the_blank`-only or simple Q->A "basic card" variant if you want true front/back flashcards instead of Wh-questions (question-generator.agent.ts:15-18 says this is not the intent).
9. Optional: cost/failure handling for review (2 LLM calls per answer) disappears if grading becomes self-graded.

## How to run it (Fact from files, nothing was executed)

- No root README. Local run: `npm run dev` at R (scripts/dev.sh starts dev Postgres on :5562, migrates, restarts Electric, runs api + web). Needs `OPENROUTER_API_KEY` and `DATABASE_URL` (R/.env.example, R/apps/api/.env.example). API default port 5560, web default 5540 (scripts/dev.sh comments, root package.json:8).
- Pages: `/add-knowledge`, `/knowledge-bit-review` (type URL), `/knowledge/answer`.
- Manual pipeline triggers (all POST, R/apps/api/src/router-table.ts:17-48): `/knowledge-sources/detect-bits`, `/knowledge-bits/question-generation-scan`, `/knowledge-bits/fill-blank-generation-scan`. Embedding/tagging/placement scans are separate and optional for this scenario (Assumption: not required for the approve -> answer path since the queue does not require tags, topic, or embeddings).
- Fact: e2e-local has a mock OpenRouter server (R/e2e-local/mock-openrouter/server.ts, `npm run e2e-local:mock-openrouter`) usable for a key-less trial; I did not inspect its coverage of the detector prompt (Assumption: may need extending).

## Open assumptions to verify

- That cheap-tier model ids in `tierToModelId` resolve with your OpenRouter key (not checked).
- That the three manual POST scans, in that order, are enough on a fresh DB to reach an approvable bit with variants (read from code, not executed).
- Whether the approval/answer web pages work behind your auth setup (API_SHARED_SECRET unset allows all, api-server.ts:280-285).
END-OF-REPORT
