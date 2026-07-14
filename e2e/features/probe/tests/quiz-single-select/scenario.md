# Scenario: single-select quiz question, options shuffled and stable across reload

**Front door:** UI — Quick-test mode on `/probe/:topicId`.

**What it proves:** The batch quiz engine (real `prepareProbeSession`/
`answerProbeSession`, not the old self-graded single-question flow) generates
a shuffled single-select question, persists the shuffle once, scores an exact
match, and the option order survives a page reload (SCENARIO 2).

**Asserts:**
- UI: the first question renders via `quiz-question`, with two or more
  `quiz-option-N` buttons.
- UI: selecting the stubbed correct option (`False`, index 1 — see
  `PROBE_QUIZ_STUB_BATCH`) renders `quiz-result` with a "Correct." verdict.
- DB: `probe_session_questions` has a row for this question with
  `type = 'single'`, `outcome = 'pass'`, `answered_index = 1`.
- UI: reloading the page renders the same option text in the same order as
  before the reload (the shuffle is persisted, not re-rolled).
