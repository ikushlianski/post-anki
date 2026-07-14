# Scenario: multi-select "select all that apply" quiz question

**Front door:** UI — Quick-test mode on `/probe/:topicId`, advanced to the
second (multi-select) stubbed question.

**What it proves:** A `type: "multi"` question lets the learner toggle several
options before one explicit submit (not one-click-per-option like
single-select), and scores all-or-nothing — a correct-but-incomplete subset
fails just like a wrong answer (SCENARIO 3).

**Asserts:**
- UI: the multi-select question renders checkboxes (not click-to-submit
  buttons) and a `quiz-submit-multi` button, disabled until at least one
  option is checked.
- UI: toggling one checkbox does **not** submit the answer (no `quiz-result`
  yet) — proving it's a single explicit submit, not one-click-per-option.
- UI: submitting a partial-but-correct subset of the correct set scores as
  "Not quite." (all-or-nothing, no partial credit).
- DB: `probe_session_questions` row for this question has
  `type = 'multi'`, `outcome = 'fail'`, and `answered_indexes` containing only
  the submitted subset (not the full correct set).
