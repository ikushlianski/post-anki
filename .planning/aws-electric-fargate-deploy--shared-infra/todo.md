# Todo: shared AWS infra

## Decisions to make
Nothing open — region, VPC reuse, secrets approach, cost tradeoffs all decided in plan.md.

## To review / clarify
Nothing open.

## Coding tasks
- [ ] Scaffold `infra-aws/` Pulumi TS project (Pulumi.yaml, Pulumi.<stack>.yaml, index.ts)
- [ ] Default VPC + public subnet lookup
- [ ] ECS cluster
- [ ] Security groups: ALB, api, electric-sync (electric only reachable from api)
- [ ] ALB + target group + listener for api
- [ ] ECS task definition + service: api
- [ ] ECS task definition + service: electric-sync
- [ ] Typecheck the stack (no AWS credentials available — cannot run `pulumi preview`/`up`)

## Manual steps
- AWS credentials or an OIDC role, before any `pulumi preview`/`up` can run
- Neon logical replication confirmed enabled for the Electric direct connection
- Pulumi encrypted secrets set: DATABASE_URL (pooled), ELECTRIC_DATABASE_URL (direct), OPENROUTER_API_KEY, API_SHARED_SECRET, ELECTRIC_SECRET

## Post-deploy checks
- API target group health check green
- Electric service health check green
- API can reach Electric over the internal security-group path

## Resolved
None yet.
