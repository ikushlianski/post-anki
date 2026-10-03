# /nextx round log — disclosures to carry into the final report

- Commit `5868dd1313d35f0d9f2c1d6a559146fa756ba7a4` ("Add a timed mock-exam mode...") and commit
  `e0ab9406429d80ce4f55b74cdd5b1bcea4b65dbb` ("Phase 1: schema column + migration + approve/reject/edit API")
  both contain unreviewed Phase 3 review-screen code, swept in by `auto-commit-after-mark-done.ts`
  (`git add -u` + all untracked), not scoped to the mark-done item itself. Neither was amended or reset.
- Review slug `ki-approval-gate-phase3` is stuck (3 consecutive FAILs, `.review-factory-state.json`).
  Every code change to the review screen after that point (stale-variant clearing, Approve-disabled-
  on-zero-variants) is unreviewed by review-factory this run.
- Judgment call: Approve is now blocked whenever a bit has zero live variants — including a bit whose
  question generation permanently fails, which becomes reject-only with no distinction from "still
  pending."
- Opus's non-blocking server-side notes, still open: the server accepts edits on non-pending bits,
  and will approve an already-rejected bit.
- exam-prep-from-sources direction: both coding tasks ("timed mock-exam mode", "exam mode picker")
  were already fully built in the codebase before this run touched them — framed as "already existed,
  no code change," not "shipped."
- The claim "9 failing files are pre-existing" (surfaced earlier this run) is an unverified hypothesis,
  not a confirmed fact — never checked directly.
- SCF/Fargate (aws-electric-fargate-deploy): cut, not attempted. Read SCF's own
  `docs/configuration.md` and `docs/getting-started.md` in full from serverless/containers (GitHub
  API, not blog posts). Facts: (1) SCF has no "existing cluster ID" field anywhere in its schema —
  it always provisions its own ECS cluster per `serverless.containers.yml`, only VPC/subnets/
  security-groups/WAF can be brought in (`deployment.awsApi.awsVpc`). (2) Every container's
  `routing` block is documented as **Required**, with a required `pathPattern` — no documented way
  to give a container no ALB rule, and no service-discovery/internal-DNS feature exists in the
  config reference at all. (3) The existing `infra-aws/index.ts` Pulumi stack runs Electric with
  `ELECTRIC_INSECURE=true`, relying entirely on a security group (reachable only from the api
  service) for protection — it is never meant to be reachable from the ALB. Since SCF requires
  every container to route through the ALB and has no private/internal container option, SCF
  cannot host Electric without exposing an unauthenticated service publicly. Per explicit
  instruction: do not ship that, do not keep Electric on Pulumi as a workaround (that's not really
  adopting SCF, it's a split stack), and do not rewrite the api's electric-proxy auth to
  compensate. **Stopping the SCF adoption here — this is a genuine blocker, not a judgment call.**
  `infra-aws/` (the existing, working, shared-cluster Pulumi stack covering api/web/bot/
  electric-sync) is left untouched and is still the real, deployable IaC for this project.
  Separately confirmed: the `serverless` CLI (which SCF rides on) is Serverless Framework v4,
  which community reports (not SCF's own docs — labeled Assumption) say requires `serverless
  login` even on the free tier; never run this autonomously regardless.
- A real third SCF option, confirmed via Electric's own docs (electric.ax/docs/api/config):
  `ELECTRIC_SECRET` is documented for self-hosted Electric too, required unless
  `ELECTRIC_INSECURE=true`. Electric could sit behind SCF's required ALB routing authenticated by
  a shared secret instead of a security group — but the api's `electric-proxy.service.ts` would
  need a code change to send that secret, which doesn't exist today. Not attempted this run; named
  as an option in the final report, not built.

- Commits `ae99796` (approve/reject-pending guard) and `040c161` (hide-rejected-from-placement-
  queue) auto-committed via `mark-done` before an independent review ran — both items were marked
  `[x]` ahead of review-factory, a self-certification gap. Closed retroactively: a Guarded-tier
  review (slug `ki-approval-gate-server-guards`, diff-base `e0ab9406`) ran both passes — Pass 1
  PASS (plan-correspondence, mechanical checks, Opus structured verdict, 3 non-blocking findings),
  Pass 2 PASS (same, streak 2, `done:true`) — confirming both `[x]` items hold. Opus's non-blocking
  findings from both passes logged as new backlog items (edit-guard-on-question-variants,
  placement-accept-on-rejected-bit, 404-vs-409 on blocked actions, missing DB check constraint on
  approval_state) — not fixed this run.
- Unlogged-until-now judgment call, since corrected: the first version of the approve/reject guard
  blocked every cross-click, including a harmless retry of the same decision after a lost response
  (re-approving an already-approved bit). Narrowed to block only the actual cross-transition
  (approved→rejected or rejected→approved) so retries stay idempotent — `knowledge-bit-approval.repo.ts`.
- The edit-guard (`updateKnowledgeBitBody` now requires `approvalState === "pending"`) was checked
  against every real caller in the repo (`apps/`, `packages/`) before relying on it — the only live
  caller of `PATCH /knowledge-bits/:id` is the review screen (`knowledge-bit-review.api.ts` →
  `editKnowledgeBit` web client). No other surface (web, MCP server, bot, extension) calls this
  route, so the guard is not a regression anywhere else.
- New commits this round: `1e722cc` (narrowed approve/reject guard), `cdb9456` (variant-edit
  pending guard), `5489ddb` (placement-accept-on-rejected-bit guard), `ecb3c41` (variant-edit
  stale-read race fix), `6755578` (rejected-bit test strengthened) — plus small todo-log-only
  commits in between. All four post-`ki-approval-gate-server-guards` units (`ki-variant-edit-guard`,
  `ki-placement-rejected-guard`, `ki-variant-edit-race-fix`) got a full Guarded two-pass review
  (Opus both passes) before `mark-done`, closing the earlier self-certification gap for good this
  round.
- `ki-placement-rejected-guard` got only one review pass of what actually shipped: Pass 1 PASS'd a
  version that returned `{ error: "already_resolved" }` directly (leaving the claim UPDATE
  committed even on refusal); a non-blocking Pass-1 finding flagged that as breaking the function's
  own "failure rolls back" comment, so it was changed mid-invocation to throw-and-rollback instead.
  Pass 2 reviewed the throw-based version that actually shipped; Pass 1's PASS verdict is on record
  for code that no longer exists. Not re-run from Pass 1 against the final version — a process gap,
  not a correctness one (Pass 2 was adversarial and independent).
- `ki-variant-edit-race-fix`'s Pass 1 ran out of order: the structured-verdict dispatch went out
  before the plan-correspondence check (a sequencing mistake), and the test file was strengthened
  (added a final-DB-state assertion, fixed a variable name) between the two dispatches. Both still
  passed independently against the versions they each saw; the test-only changes didn't affect the
  structured verdict's conclusions, but this is logged as a process deviation from the skill's
  stated order.
- Judgment call: skipped "Add a DB check constraint on approval_state's allowed values."
  `apps/api/src/db/schema.ts:1503` documents this codebase's own convention — no CHECK constraint
  precedent anywhere, app-level validation only. Adding the first one is a bigger call than a
  one-line hardening fix; left open in todo.md rather than decided unilaterally.
- Correction to an earlier instruction in this log: there is no separate lint step to run or skip.
  Neither `apps/api` nor `apps/web` has a lint script or ESLint/Biome config; `apps/bot`'s own
  "lint" script is literally `tsc --noEmit`. `tsc` is the only static check this project has — it
  ran clean on every unit this round.
- Deferred, not fixed: "Clear topicId when rejecting a bit that was already placed" — changes what
  reject does today, and learners already can't see the difference (the approved-only gate hides
  it either way). Left as an open backlog item.
