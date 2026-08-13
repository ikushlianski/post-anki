---
type: spec
branch: mastra-prompt-why-audit
task: "Audit all Mastra agent prompts for consistent why-emphasis (issue #89)"
complexity: simple
state: confirmed
updated: 2026-08-13
verification:
  kind: documented-audit-trail (no UI/DB surface — text-only instruction edits)
  gate: npx tsc --noEmit after any edit (no behavioral test possible for prompt strings)
---

# Spec: Audit all Mastra agent prompts for consistent why-emphasis

## What this is

A one-line-per-file compliance audit of every agent in `apps/api/src/mastra/*.agent.ts` against
`.product/PRINCIPLES.md`'s "Architect-level, not cramming" principle ("Every Socratic question
probes WHY and how things work together — never tests recall of facts or syntax"), plus a small
set of concrete instruction edits for the one file that's a genuine gap.

## The PM's "no planning needed" call — does it hold up?

**Partially.** The mechanical shape (read files, note compliance, edit where needed) was right —
no architecture, no scenarios, no e2e surface. But two things the PM's triage comment got wrong
enough to be worth a planning pass:

1. **Scope was undercounted.** The PM named 5 remaining files to review (`decide`,
   `curriculum-architect`, `domain-priority-review`, `lecture-source-selector`,
   `language-practice`) plus the 2 already-confirmed (`mentor`, `probe-quiz`) — 7 total. The repo
   actually has 18 `*.agent.ts` files. 11 files weren't on the PM's list at all: `cards-compiler`,
   `doc-research-architect`, `doc-scan`, `domain-taxonomy-mapping`, `lecture-compiler`,
   `sibling-discovery`, `socratic`, `structure-editor`, `study-chat`, `language-chat`,
   `writing-check`.
2. **The PM's list contradicts the issue body it's attached to.** The issue's own text explicitly
   excludes language-subject agents as "intentionally recall-based per `.bmad/english-subject-
   merge/`" — yet the PM's triage comment lists `language-practice.agent.ts` as one of the 5 files
   needing review. Confirmed by reading `.bmad/english-subject-merge/architecture.md`: it's an
   explicit design decision (`language-chat` was built as a *separate* agent from `study-chat`
   specifically because English practice has "no gap to close... a score and 1-2 alternative
   phrasings," not because it forgot to inherit why-emphasis language). `language-practice.agent.ts`
   should **not** be edited for why-emphasis; the PM comment is wrong on this point.

**Where it gets genuinely judgment-heavy** (the PM's "read + note compliance" framing understates
this): about a third of the real agent list isn't a Q&A/teaching agent at all — it curates,
maps, or restructures content (`curriculum-architect`, `doc-research-architect`,
`domain-taxonomy-mapping`, `sibling-discovery`, `structure-editor`, `doc-scan`,
`domain-priority-review`, `lecture-source-selector`). Whether "every Socratic question probes
WHY" even applies to an agent that never asks the learner a question is a real scoping call, not
a mechanical read. See the per-file table below for how each was resolved and why.

## Audit table

| File | Role | Verdict | Reasoning |
|---|---|---|---|
| `mentor.agent.ts` | Socratic ask + eval | **Compliant** | Confirmed by PM/issue. Explicit: "Probe WHY and HOW THINGS FIT TOGETHER... why this technology or approach over the alternatives." |
| `probe-quiz.agent.ts` | Quiz batch generator | **Compliant** | Confirmed by PM/issue. Same explicit why/alternatives phrasing. |
| `decide.agent.ts` | Decision pressure-test | **Compliant** | "Architecture-level judgment and tradeoffs, never syntax or tool trivia," plus the whole mechanism (strengths/blindSpots/questions/verdict) exists specifically to force the learner to defend *why* their decision holds. Arguably the most why-centric agent in the set. |
| `cards-compiler.agent.ts` | Review card generator | **Compliant (spirit)** | "Frame every prompt and answer around judgment and tradeoffs — never syntax or API trivia." Same non-recall standard as probe-quiz, different wording. |
| `curriculum-architect.agent.ts` | Curriculum capture from pasted material | **Compliant, not a Q&A agent** | "Focus on judgment, tradeoffs, and how things fit together — never syntax or API trivia," and explicitly: "A topic summary is one sentence on **why** the topic matters at the architecture level." A literal why-requirement, not just spirit. Never asks the learner a question — it structures content into modules/topics — but the principle still applies to what it optimizes for, and it names "why" directly. |
| `doc-research-architect.agent.ts` | Learning-map synthesis from web research | **Compliant, not a Q&A agent** | Identical judgment/tradeoffs line plus the identical literal "one sentence on **why** the topic matters at the architecture level" requirement. Same reasoning as curriculum-architect. |
| `lecture-compiler.agent.ts` | Briefing synthesis from approved sources | **Compliant (spirit), not a Q&A agent** | Identical judgment/tradeoffs line. Same reasoning. |
| `domain-priority-review.agent.ts` | Re-prioritization suggestions | **Compliant, different mechanism** | Not learner Q&A. Every suggestion already requires a `reason` field ("a short, plain-language justification") — the why is structurally mandatory, just not phrased as "probe why" since there's no question being asked. |
| `doc-scan.agent.ts` | Changelog-driven map suggestions | **Compliant, different mechanism** | Same pattern — both suggestion types require a `reason` field. |
| `lecture-source-selector.agent.ts` | Candidate source extraction | **Compliant, different mechanism** | Requires `whySelected` per candidate — "why" is literally a named field. |
| `socratic.agent.ts` | Socratic answer eval (single concept) | **Compliant** | Eval-only agent, same shape as `mentor.agent.ts`'s eval half (which the issue already accepted as compliant without literal "why" wording) — grades whether the learner "genuinely demonstrate[s]" understanding vs. a shallow/vague answer. **Traced, confirmed, not hypothetical:** `apps/api/src/socratic/socratic.service.ts:283` gets its question from the same shared `buildProbeQuestionForGap()` (`apps/api/src/probe/probe.service.ts:82`) that `apps/api/src/push/push.controller.ts` uses for push questions, and that function calls `AGENT_KEYS.mentorAsk` (`probe.service.ts:221`) — i.e. `mentor.agent.ts`'s ASK instructions, already confirmed compliant above. The question side of the socratic loop is not a separate, ungoverned prompt; it's the same why-probing agent reused. No gap here. |
| `study-chat.agent.ts` | Free-form architecture study chat | **Gap — edited** | The one real finding. Explicitly architecture-mentor-kind (free chat during study of an architecture topic) but its instructions never biased toward why/rationale — "Answer whatever the learner actually asks: clarify a concept, compare it..." with no instruction to favor reasoning over a bare fact. Fixed — see edit below. |
| `structure-editor.agent.ts` | Tool-calling draft-structure editor | **Out of scope** | Executes structural edits (add/remove/merge modules) via tool calls; never asks or answers a learning question. The why-emphasis principle doesn't have a natural attachment point here. |
| `domain-taxonomy-mapping.agent.ts` | Curriculum-to-taxonomy node matching | **Out of scope** | Pure matching/id-resolution agent, no learner-facing text at all. |
| `sibling-discovery.agent.ts` | New-topic tree placement | **Out of scope** | Same — structural placement, no learner Q&A. |
| `language-practice.agent.ts` | English translation drills + grading | **Excluded (by design)** | Confirmed via `.bmad/english-subject-merge/architecture.md`: deliberately recall/usage pedagogy, not architecture mentoring — built as a structurally separate model specifically *because* the gap/why model doesn't fit. **The PM's triage comment lists this file for review — that's inconsistent with the issue body's own exclusion and should not be acted on.** |
| `language-chat.agent.ts` | English free-form chat | **Excluded (by design)** | Same rationale, explicit in its own instructions: "Unlike an architecture mentor, you do NOT withhold the answer... give the correct translation or correction plainly." |
| `writing-check.agent.ts` | English writing native-soundingness grading | **Excluded (by design)** | Same English-pedagogy bucket — grades native-soundingness, not architectural judgment. |

## The one edit (applied)

`apps/api/src/mastra/study-chat.agent.ts` — added a rule to `INSTRUCTIONS`'s `Rules:` block, after
the existing "Ground answers..." bullet:

```
"- Even in free-form chat, favor WHY over WHAT — explain the reasoning or tradeoff behind an",
"  answer, not just the fact itself. Never give a bare definition or fact when the question",
"  invites judgment; if the learner asks a pure lookup question with no judgment angle, a direct",
"  answer is fine.",
```

Placed after the existing "Ground answers in the current topic..." bullet, before "If the
learner's learning map has nothing relevant...". The trailing clause ("if the learner asks a pure
lookup question... a direct answer is fine") is deliberate — study-chat is free-form by design
(unlike `mentor`/`probe-quiz`'s structured probing), so the edit should not turn every reply into
a forced Socratic question; it should bias reasoning-first without breaking the agent's existing
conversational contract.

## Explicitly not edited

Every other file in the table above — either already compliant (literal or spirit), a different
non-Q&A mechanism where "reason" is already structurally required, or out of scope as a
non-learner-facing agent. No edits recommended for `decide`, `curriculum-architect`,
`doc-research-architect`, `lecture-compiler`, `cards-compiler`, `domain-priority-review`,
`doc-scan`, `lecture-source-selector`, `socratic`, `structure-editor`,
`domain-taxonomy-mapping`, `sibling-discovery`, `language-practice`, `language-chat`,
`writing-check`.

## Inventory completeness (checked, not assumed)

- `apps/api/src/mastra/mastra.ts` registers all 18 files / 20 agent instances in `AGENT_KEYS` and
  `getMastra()` — no dead/unregistered agent exists that could be silently skipped.
- Per-call prompt fragments built outside `*.agent.ts` (e.g. `curriculum-prompt.ts`, which appends
  request-specific text to `doc-research-architect`'s calls) were checked for hidden pedagogy
  language (`why`/`judgment`/`tradeoff`/`rationale`/`recall`) — none found. All pedagogy-shaping
  instruction text lives in the 17 agent files this audit already covers; there is no second,
  ungoverned prompt layer.

## Verification

No UI/DB surface, no playwright plan — this shipped as instruction-string edits only. Done when:
1. `study-chat.agent.ts`'s new rule lands and reads naturally alongside its existing Rules block —
   done, verified by reading the file post-edit.
2. `npx tsc --noEmit` passes (the only mechanical gate available for a prompt-string change) —
   done, plus the repo's full lint/test gates as a broader sanity check.
3. This table stands as the audit trail the issue's "Done when" asks for — one line per agent,
   compliant/excluded/edited with reasoning, not just a pass/fail — done, all 18 agent files
   covered (verified against `ls apps/api/src/mastra/*.agent.ts` and `mastra.ts`'s registration).
