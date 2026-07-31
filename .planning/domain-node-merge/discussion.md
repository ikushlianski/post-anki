---
type: discussion
branch: domain-node-merge
task: domain-node-merge
state: confirmed
updated: 2026-07-31
---

# Discussion log: Domain-node merge

This item was planned autonomously (no live interview round — the task explicitly authorized
self-resolving every fork using this codebase's established "recommended-default rule": propose
the stack-compatible, pattern-following default and proceed, only escalating a fork with no safe
default). The forks below are recorded here in the same shape a live interview round would have
produced, each with the recommended answer that was actually taken.

## Branch-defining fork: cycle-guard walk direction

**Question:** should the guard walk source's descendants (checking whether target is among them)
or target's ancestors (checking whether source is among them)?

**Recommended answer, taken:** walk target's ancestors. Both directions answer the same yes/no
question correctly, but the ancestor walk is O(tree depth) — bounded, cheap, and matches an
already-existing shape in this codebase (`pathFor()`'s `while (current.parentId)` loop in
`domain-placement.orchestrator.ts`), while the descendant walk requires enumerating the source's
entire subtree just to answer a single membership question. See `spec.md`'s "Cycle-guard design"
for the full reasoning, including the depth-cap correctness issue this fork surfaced.

## Branch-defining fork: same-name-sibling handling

**Question:** when a re-parented child ends up alongside a same-named sibling under the target, do
they get merged/deduplicated, or coexist as two siblings?

**Recommended answer, taken:** coexist, no matching attempted. Verified against every existing
merge in the codebase — `mergeCurricula`'s modules land as additional modules with no
title-matching reconciliation (explicit in its own docstring); `mergeSubjects`/`mergeTags` never
attempt name-collision handling. No prior merge in this codebase does semantic reconciliation on
merge; adding it here would be new, unproven behavior, not a continuation of an established
pattern.

## Independent fork: what happens to `domain_priority_suggestions` /
`domain_supersession_suggestions` / `domain_topic_suggestions` referencing the source node

**Question:** reassign to the target, or delete?

**Recommended answer, taken:** delete the priority/supersession rows (ephemeral, 1:1 tied to the
retiring node's identity); reassign `domain_topic_suggestions.proposed_parent_node_id` (a
forward-looking pointer that would otherwise silently break); leave
`domain_topic_suggestions.created_domain_node_id` untouched (a historical record, mirrors
`llm_call_events`' own established precedent from `mergeCurricula`). Full reasoning in `spec.md`'s
Decisions #3 and #4 — this fork surfaced only after grepping every column referencing
`domain_node_id` in `schema.ts`, not from the issue text itself.

## Independent fork: merge-target picker scope

**Question:** does the picker only offer siblings of the source node, or every node in the
subject's tree?

**Recommended answer, taken:** every node in the tree, path-labeled. The issue's own motivating
example (two independent AI call sites proposing differently-named nodes for the same concept)
gives no guarantee the duplicate lands as a sibling — it could land anywhere in the tree depending
on which parent each agent call resolved. Restricting the picker to siblings would make the tool
useless for the exact case the issue names.

## Independent fork: cross-subject merge

**Question:** can a domain node merge into a node belonging to a different subject?

**Recommended answer, taken:** no — `different_subjects` precondition, mirroring `mergeCurricula`'s
own guard. A domain node's position only has meaning within its own subject's tree.

## Settled vs. still open

Settled: cycle-guard direction and depth-cap handling, same-name-sibling handling, suggestion-table
cleanup, picker scope, cross-subject restriction, endpoint/route shape, frontend attachment point.

Still open: none. Every fork this plan needed resolved to a recommended default backed by either
direct precedent in the codebase or a concrete correctness argument (the depth-cap issue). Nothing
is deferred to `/write-playwright-tests` or `/implement-playwright`.
