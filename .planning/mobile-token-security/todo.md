---
type: todo
branch: mobile-token-security
task: "Secure token storage and session persistence on mobile (#67)"
state: open
updated: 2026-07-31
---
# Todo: Secure token storage and session persistence on mobile (#67)

## Decisions to make
Nothing to decide — all forks resolved during planning, see spec.md's "Decisions made
autonomously".

## To review / clarify
Nothing to review — this item was planned unattended with standing autonomous-confirmation
authorization; every open question had a safe, reversible default already applied.

## Manual steps
No manual steps required. No env vars, secrets, or infra outside IaC — this is a frontend-only
change to `apps/mobile`.

## Post-deploy checks
- [ ] Once a physical device is available (issue #65), confirm the "session ended" Connect
      copy actually renders after a real token revocation on-device, not just under the
      localStorage-fallback Playwright proof.
