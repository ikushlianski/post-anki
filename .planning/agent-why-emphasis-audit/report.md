# Agent why-emphasis audit

Audit of Mastra agent prompts for consistent why-emphasis (issue #89). The system prompt of
every agent that teaches, gives feedback, or explains a concept should tell it to explain WHY a
concept/answer matters — the reasoning, rationale, or tradeoff behind it — not just whether the
learner got it right.

## Changed

### socratic.agent.ts

Added a why-emphasis rule to the "senior architecture mentor" system prompt. It previously only
graded correctness and produced corrective fragments, with no instruction to explain why the
concept matters. New rule:

> Explain WHY an answer matters, not just whether it's right — the reasoning or tradeoff behind
> the concept. Fold this into explanation and correctAnswer.

The phrasing matches the convention already in mentor.agent.ts ("the reasoning or tradeoff behind
an answer, not just the fact itself") and study-chat.agent.ts ("favor WHY over WHAT").

## Audited, deliberately left unchanged

| Agent | Why no change |
|---|---|
| cards-compiler | Already why-emphasis: "Frame every prompt and answer around judgment and tradeoffs — never syntax or API trivia." |
| lecture-compiler | Already why-emphasis: "Focus on judgment, tradeoffs, and how things fit together." |
| study-chat | Already why-emphasis: "favor WHY over WHAT — explain the reasoning or tradeoff behind an answer." |
| study-material-writer | Why-adjacent already ("focused on judgment and understanding, not syntax or API trivia"); its output is a worked example or analogy, whose job is demonstrating/mapping a concept, not justifying its importance. No explicit "why it matters" needed. |
| writing-check | Already explains in its domain: "feedback explaining what does or doesn't sound native." That is the why for a native-soundingness grader. |
| language-practice | Language-domain grader, not architecture. The grade-batch agent gives native alternatives but the issue's why-emphasis (architectural rationale, tradeoffs) does not transfer; forcing it would be off-domain. |
| doc-scan | Pure scan/suggestion generator with no explanation-to-learner role. |
| domain-taxonomy-mapping | Pure mapping/classification, no explanation role. |
| learning-list-classifier | Pure signal extraction, no explanation role. |
| learning-list-slice | Proposes topics and gap labels, no explanation role. |
| sibling-discovery | Taxonomy placement, no explanation role. |

## Verification

`npx tsc --noEmit` in `apps/api` passes with no errors (prompt-string change only).
