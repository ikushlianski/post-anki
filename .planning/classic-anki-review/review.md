classic-anki-review — Anki review (classic), 5 scenario files, 45 scenarios
Run: unattended sweep, existing log reused (19 passed, 0 failed; not rerun)
─────────────────────────────────
01 S1  Reveal, then grade                    PASS
01 S2  Grade moves next review date          PASS
01 S3  Fact stays hidden until reveal        PASS
01 S4  Chat hidden until reveal              PASS
01 S5  Keyboard review                       PASS
01 S6  Move between review modes             PASS
01 S7  Empty, failed load, failed grade      PASS
01 S8  Restorable history per grade          PASS
01 S9  Typed and Anki grade on one bit       PASS
01 S10 Typed mode unchanged                  PASS
04 S1  Paste starts processing at once       PASS
04 S2  Quick pastes, no pile-up              PASS (run count not observable)
04 S3  Background failure harms nothing      PASS (log line not observable)
04 S4  Timer and paste never double-process  PASS
04 S5  Interrupted run finished by timer     MISSING
08 S1  Every bit gets one basic card         MISSING (no @anki-basic tag)
08 S2  Approval page shows basic card        MISSING
08 S3  Anki review prefers basic card        MISSING (no @anki-basic tag)
08 S4  Typed mode never uses basic cards     MISSING
08 S5  Edit pending bit replaces basic card  MISSING
08 S6  Existing approved bits get basic      MISSING
08 S7  Failed card retried max three times   MISSING
08 S8  Overlapping runs never double-pay     MISSING
08 S9  Backstop job every 5 minutes          MISSING
08 S10 Injected instructions ignored         MISSING
11 S1  New card 1m, 10m, then graduates      PASS
11 S2  Hard repeats, Easy graduates          PASS
11 S3  Lapse relearns in 10 minutes          PASS
11 S4  Learning cards first in queue         PASS
11 S5  Learn-ahead 20-minute window          PASS
11 S6  Grade button previews                 PASS
11 S7  Existing schedules keep working       PASS
11 S8  Typed answer ends learning step       PASS
11 S9  History copy holds step state         PASS
13 S1  Undo last grade                       PASS (Z key and done-screen undo not driven)
13 S2  Undo refused after reviewed elsewhere PASS
13 S3  Session progress line                 PASS
13 S4  End-of-session summary                MISSING
13 S5  Edit mid-review                       MISSING
13 S6  Suspend a card                        PASS (typed queue not driven)
13 S7  Bury until tomorrow                   PASS
13 S8  Undo a suspend or bury                MISSING
13 S9  Leech auto-suspend                    PASS (12th/16th repeat not driven)
13 S10 Undo, grade, suspend never interleave MISSING
13 S11 Typed queue skips suspended/buried    MISSING

Verdict: blocked. 29 of 45 scenarios PASS on the existing sweep; 16 have no e2e test (14 deliberately skipped, 2 untagged).
The sweep result does not clear the gap; the fix is upstream in /write-playwright-tests.

Needed for /write-playwright-tests:
- 04 S5: stuck "processing" source reclaimed by backstop scan after hold timeout; no partial bits per paste.
- 08 S1, S3: add @anki-basic tags; current kick and queue tests assert basic cards but are tagged @anki-kick and @anki-queue.
- 08 S2: "Front / back" label on approval page; basic-card edit saves a new version; Approve enabled for basic-only bit.
- 08 S4: typed queue never returns a basic card; topic due badge excludes basic-only bits; basic card sent to typed grading is refused.
- 08 S5: editing a pending bit's text removes its basic card and regenerates from the new text.
- 08 S6: existing approved bits gain a basic card, max 50 per run, oldest first.
- 08 S7: empty side, over-long side, front equal to back, front containing answer each yield no card; bit skipped after 3 failures.
- 08 S8: overlapping runs make one AI call per bit; a run whose claim was taken over after 10 minutes stores nothing.
- 08 S9: backstop endpoint rejects missing secret and returns an error status on failed run.
- 08 S10: injected instruction text in a bit yields a normal card or a counted failure only.
- 13 S4: summary counts per grade, recall share, time; no summary when no actions; Keep reviewing returns with nothing lost.
- 13 S5: edited text used for grade and undo; Esc cancels, Ctrl/Cmd+Enter saves; empty text refused; conflict message keeps typed text.
- 13 S8: undo of suspend or bury restores card to front and clears the server flag.
- 13 S10: undo racing grade or suspend on one card serialises; a failed action changes nothing.
- 13 S11: typed queue skips suspended and buried cards; an expired bury is served again.

Code read (18 citations checked by reading the lines):
- 4 correct, 1 partly right, 13 wrong or off-target. Most wrong cites point at neighbouring lines, not the named behaviour.
- Review screen: "Show answer" is at anki-review-card.tsx:34 (cited :20, a container); grade buttons render at anki-review-screen.tsx:222-228 (cited :138, a link label).
- Grade save and advance live in apps/web/src/knowledge-bit/anki-review-session-actions.ts; cited anki-review-screen.tsx:53-65 is a query-key helper.
- Grade orchestrator: the schedule-plus-history lock is knowledge-bit-review.orchestrator.ts:66-109 (cited :31-37, a replay helper); the refusal check is :58-64 (cited :22-29).
- Schema: knowledge_bit_reviews is schema.ts:1266; cited :1247 is the schedule table's suspendedAt column.
- Defect in contract: 01 S2 says a never-reviewed card returns in 1 day, but 11 S1 and knowledge-bit-learning-steps.ts:1-4 use 1m/10m. The cited test "should bring a never-reviewed card back tomorrow" does not exist.
- Stale status: 08 S1 and S3 tick [x] while still listing "[ ] pending implementation", though knowledge-bit-basic-card-generation.orchestrator.ts exists.
- 04 and 11 have no code citations to check; 11 says "file:line citations added by /implement-ie" on every scenario.
END-OF-REPORT
