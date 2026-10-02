# Scenarios

## Acceptance
- [ ] `pulumi preview` (or `--help`/typecheck if no AWS creds) shows a VPC lookup, one ECS cluster, one ALB, two services, three security groups, no RDS, no NAT gateway
- [ ] API task definition's env vars match `apps/api/src/shared/env.ts`'s required schema exactly
- [ ] Electric task definition's `DATABASE_URL` is wired from the direct (non-pooled) Neon secret, never the pooled one
- [ ] Electric service security group allows ingress only from the API service security group, never from the ALB or the internet
- [ ] Stack is self-contained under `infra-aws/`, no edits to `infra/` or `.github/workflows/deploy.yml`
