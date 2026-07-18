---
type: scenarios
branch: probe-quiz-grounded-explanations
task: Probe quiz per-option explanations, grounded anti-hallucination citations, and explicit full-batch generation
state: confirmed
updated: 2026-07-15
---
# Scenarios: Probe quiz grounded explanations

**Prerequisite context for every scenario below:** these all extend the `ProbeSessionQuestion` DTO, `probe-quiz.agent.ts`, and `probe-session.{generate,map,repo,service}.ts` that `.planning/topic-study-experience/` introduces (type, correctAnswerIndexes/answeredIndexes, the shuffle-at-insert step, the outcome-gated reveal). None of that exists on `main` yet. See `architecture.md` for the hard sequencing rule.

## Business Scenarios

### SCENARIO 1: Every option shows why it's right or wrong, after answering

The learner answers a quiz question on the topic page. Once they've submitted, each option — not just the one they picked, and not just the correct one — shows a short line explaining why it's right or wrong.

What to verify:
- All options carry an explanation, not only the selected one and not only the correct one.
- The explanation for the correct option and the explanation(s) for the wrong option(s) are visibly different, specific statements — not a single generic "that's wrong" repeated.
- This renders inline in the same interaction, immediately after submitting — no extra click or reload needed.

### SCENARIO 2: A wrong answer surfaces a real, clickable documentation link

The learner picks a wrong option. The explanation for the correct option (and/or the option they picked, if a citation applies) includes a link to the specific documentation passage that supports it, and the link is clickable and resolves to a real page — not a plausible-looking but fabricated URL.

What to verify:
- The citation link shown is one that was actually present in the material the question was grounded in for this curriculum (see architecture.md's grounding/validation flow) — never a URL invented by the model.
- Not every option is required to carry a citation (some explanations are self-evident or the grounding material has no specific passage to point to) — a missing citation is a `null`, not an error.
- The link is real and correctly formed enough to click through to (an actual URL string copied from the grounding material, not paraphrased).

### SCENARIO 3: The model invents a URL that never appeared in the source material — it gets dropped, not trusted

The generation agent, despite instructions, returns a `citationUrl` for some option that does not appear anywhere in the grounding material used for that curriculum.

What to verify:
- That fabricated URL is never shown to the learner — it's nulled out before the question is persisted.
- The rest of that option's explanation text still renders normally; only the untrustworthy citation is dropped, not the whole question or the whole explanation.
- This validation happens without a second LLM call — a cheap check against the grounding material already fetched for generation.

### SCENARIO 4: Shuffled options keep their explanations attached to the right option

A question has its option order shuffled once at generation/insert time (per `topic-study-experience`'s existing shuffle-at-insert behavior). After the shuffle, each option's explanation still describes *that* option, not whatever used to sit in that position before shuffling.

What to verify:
- If option B (the original, pre-shuffle "why this is right" text) ends up at index 0 after shuffling, index 0's explanation is B's explanation, not whatever was originally at index 0.
- This holds for both single-select and multi-select questions, and is stable across reload (persisted already-shuffled).

### SCENARIO 5: Explanations and citations stay hidden until the learner answers

The learner opens a fresh, unanswered question. No explanation text or citation link is visible or fetchable for that question yet — same reveal timing as the correct-answer index itself.

What to verify:
- The API response for an unanswered question does not include populated explanations (mirrors the existing correct-answer reveal gate, not a new mechanism).
- Explanations become visible in the very same response that reveals the outcome/correct answer after submitting — no separate reveal step, no way to peek early via a different endpoint.

### SCENARIO 6: A topic with little or no linked documentation still gets a usable quiz

The learner generates a quiz for a topic whose curriculum has thin or no source material (e.g., an older curriculum created before doc grounding existed, or one with no `sources` rows at all). The quiz still generates and is answerable.

What to verify:
- Questions and per-option explanations still generate (falling back to the model's general knowledge, same as today's existing grounding fallback) rather than the button failing outright.
- No option shows a citation link in this case — citations are only ever shown when they're real, so with no grounding material to validate against, every `citationUrl` is `null`.

### SCENARIO 7: No questions exist yet — an explicit button generates the whole batch

The learner opens Quiz mode on a topic that has no active probe session yet. Instead of a quiz silently starting to generate the moment the page loads, they see a "Generate Probing Questions" state with a button. Generation — and its cost/latency — only happens when they click it.

What to verify:
- On mount, if an active session already exists for this topic, it renders immediately (checked without triggering generation) — same as today's `getActiveProbeSession` check the bot already relies on.
- If none exists, no generation call fires automatically; the button is the only thing that triggers `prepareProbeSession`.
- While generating, a visible loading state covers the full duration of the call (batches can now be large — see SCENARIO 8 — so this may take noticeably longer than a single question would).
- Once generated, the full batch is available immediately — the learner is not fed one question at a time from a queue.

### SCENARIO 8: Batch size scales with how much there is to test, not a fixed small number

The learner generates a quiz for a topic with many concepts/gaps to cover. The batch isn't capped at a small fixed number regardless of how much material there is.

What to verify:
- A topic with more concepts to test produces a proportionally larger batch than a topic with few, rather than both landing on the same flat count.
- There is a sensible floor (still at least 10 questions, matching today's existing minimum) but no hardcoded ceiling.
- A module-scope batch (bot-only surface today) is no longer clamped at a flat maximum either — see architecture.md's note on this being a deliberate, logged side effect on the bot's existing module quiz, not new scope for the bot itself.

## Technical/Architectural Scenarios

### SCENARIO 9: Pre-existing questions generated before this change still load and answer correctly

A probe session question created before this plan's migration lands (no `option_explanations` column value, i.e. `null`) is loaded or answered after deployment.

What to verify:
- The question still renders and can still be answered — a missing/`null` `optionExplanations` degrades to "no explanations available for this question," not a crash or a blocked answer flow.
- `answerProbeSessionResultSchema`'s `optionExplanations` field tolerates `null` for exactly this reason.
