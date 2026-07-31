domain-node-merge — Add domain-node merge to close near-duplicate knowledge-map nodes (issue #61)
─────────────────────────────────────────────────────────────────────────────
S1  merge-domain-node-reassigns-curriculum-and-child   PASS
S2  merge-picker-excludes-invalid-targets              PASS

2/2 e2e scenarios pass. S1 exercises the full write + read path: mergeDomainNodes
reassigns the curriculum and child node, deletes the source row, and the
GET /subjects/:id/domain-map read path correctly re-nests the moved child under
the target — the exact recursion the cycle guard protects. S2 confirms the
picker excludes the source node and its whole subtree while still offering
unrelated branches, path-labeled.

Regression set (11 previously-merged features, 49 tests): 47 PASS, 2 FAIL.
The 2 failures (@curriculum-merge.S1, @curriculum-merge.S2) are a real,
previously-undocumented instance of a pre-existing test-harness race —
confirmed via direct A/B reproduction against the pre-merge commit (dd704de^)
that it is NOT caused by domain-node-merge. See notes below.

One real fix applied during this review (verification-repo action file, not
app code, not test.ts): features/domain-map/actions/add-course-under-node.action.ts
now retries the "add course here" toggle click instead of clicking once and
waiting — S1's own setup step was hitting the same pre-existing hydration race
before it ever reached the merge action itself.

Verdict: PASS. No evidence the cycle guard (isAncestor) or the merge write
path can produce a malformed tree. Both e2e scenarios go green after fixing
an unrelated test-setup flake; the 2 remaining regression failures are
unrelated to this feature and pre-date it.
