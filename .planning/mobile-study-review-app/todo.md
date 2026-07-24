---
type: todo
branch: mobile-study-review-app
task: React Native mobile app for Post Anki, reusing apps/api, starting with core study/review flow
state: open
updated: 2026-07-17
---
# Todo: React Native mobile app (core study/review flow)

## Decisions to make
Nothing to decide — PAT-vs-login-screen was the one real fork and it's resolved and recorded in
`architecture.md`.

## To review / clarify
Nothing to review.

## Manual steps
- After implementation, run `apps/api/scripts/create-api-token.ts` locally (against the dev
  database) to mint the first token — this is a manual, human-run step by design (see
  architecture.md: token minting is intentionally a script, not an HTTP endpoint).
- Install the Expo Go app on a physical iOS or Android device to actually see the app render —
  this machine has no iOS Simulator (`simctl` missing, Xcode Command Line Tools only) and no
  Android emulator (no `emulator` binary, no AVD). This is a hard environment limit, not a task
  gap; see Definition of Done for what is and isn't provable on this machine.
- If/when the user wants the mobile app to reach the deployed Cloud Run `apps/api` instead of
  localhost, set `EXPO_PUBLIC_API_BASE_URL` in the Expo app's env — no infra change required.

## Post-deploy checks
Not applicable — this slice has no deploy step of its own (no new Cloud Run service, no Pulumi
change). The only backend-visible change is the `api_tokens` migration, applied the same way
every other migration already is (`db:migrate`).
