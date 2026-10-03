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
