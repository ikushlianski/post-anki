---
type: todo
branch: probe-quiz-grounded-explanations
task: Probe quiz per-option explanations, grounded anti-hallucination citations, and explicit full-batch generation
state: open
updated: 2026-08-09
---
# Todo: Probe quiz grounded explanations

This plan was planned fully unattended, with every open question resolved using a sensible default. This file logs those calls briefly for review, plus what remains genuinely open.

## Judgment calls made autonomously (for review — none block confirmation)

1. Requires a related in-progress feature to merge first, since most affected areas depend on its changes.
2. Reworks answer-option reindexing on its own path rather than changing a shared function used elsewhere.
3. Citations are checked after a quiz is generated, reusing material already fetched, with no extra searches or AI calls.
4. If a citation fails its check, only that one answer option loses its citation, not the whole question.
5. Removing the cap on how many questions a batch can hold applies everywhere quizzes are generated, including the bot's existing quizzes.
6. Per-option explanations are optional everywhere, so older quiz data created before this change still works.

## Decisions to make
Nothing left to decide — every open question above already has a chosen default.

## To review / clarify
- Several shared areas are touched by this plan and a related one at the same time; work needs to land in the right order or changes could conflict.
- Two other in-progress plans may also touch the same quiz-generation instructions; worth checking for overlap before merging everything together.
- A shared search step used by other features gains an extra field; other features using it should be checked that they still work unchanged.

## Manual steps
- Once the related feature's database change has landed, generate and apply this plan's own database update before testing.

## Post-deploy checks
- Generate a quiz for a well-sourced topic and confirm at least one answer shows a real, clickable citation.
- Generate a quiz for a topic with few sources and confirm it still generates, just without citation links.
- Check that each answer's explanation still matches that specific answer correctly even after answers are shuffled.
- Generate a quiz for a topic with many open gaps and confirm the batch size grows sensibly, not runaway.
