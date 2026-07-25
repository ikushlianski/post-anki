---
type: todo
branch: mobile-study-review-app
task: React Native mobile app for Post Anki, reusing apps/api, starting with core study/review flow
state: open
updated: 2026-07-25
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
- If/when the user wants the mobile app to reach the deployed Cloud Run `apps/api` instead of
  localhost, set `EXPO_PUBLIC_API_BASE_URL` in the Expo app's env — no infra change required.

## Verification status (updated after re-run against current main)

Real, machine-provable verification now goes further than "typechecks, never run":
- `apps/mobile` boots through Expo's **web target** (`expo start --web`, via `react-native-web`/
  `react-dom`, added as real deps) — Metro serves real HTML, the JS bundle compiles with zero
  real module-resolution errors, and React mounts.
- Exercised a **real backend round trip** through a token minted with `create-api-token.ts`
  against a locally running `apps/api`: shared-secret caller → 200, minted PAT → 200, bad token →
  401 (matches the dual-auth scenario in `spec.md` exactly).
- Drove the actual Connect → Today flow end-to-end in a real browser (Playwright): pasted a
  minted token, connect() called the real API, the app persisted the token and rendered the
  Today screen's real empty-state copy ("Nothing to review yet — check back later.") from a real
  `/daily-push` response.
- This surfaced and fixed one genuine cross-platform bug (not a web-only artifact): the root
  layout only read the stored token once on mount, so after a successful Connect it immediately
  bounced the user back to the Connect screen — this would have hit real iOS/Android use too, not
  just the verification path. Fixed by having token writes notify the layout synchronously
  instead of re-deriving from a stale one-time read.

Two things surfaced that are specific to using a browser as the verification harness, not bugs in
the app or blockers for real devices:
- `expo-secure-store` genuinely has no web implementation (Expo SDK limitation, confirmed by
  reading the package source) — token storage only works via `SecureStore` on iOS/Android, which
  is the app's only shipped target. No web-only code was added to the committed app; the browser
  verification above used a temporary, reverted local shim plus `--disable-web-security` in the
  Playwright browser launch to route around this and around CORS (the API has no CORS headers
  because none of its real callers — apps/web's proxy, apps/bot, apps/mobile's native fetch —
  need them; native `fetch` doesn't enforce CORS the way a browser does).

**Still genuinely unverifiable on this machine:** native rendering (real iOS/Android layout,
fonts, safe-area insets, gesture handling) and Expo Go's actual on-device experience. Nothing on
this machine substitutes for that — it requires either a physical device with Expo Go or Xcode's
iOS Simulator / Android Studio's emulator, neither of which is installed here (`simctl` missing,
no `emulator` binary/AVD configured). This is now a narrower gap than before: the app's logic,
data flow, and auth have all been exercised for real; only device-specific rendering/gesture
behavior remains unobserved.

## Post-deploy checks
Not applicable — this slice has no deploy step of its own (no new Cloud Run service, no Pulumi
change). The only backend-visible change is the `api_tokens` migration, applied the same way
every other migration already is (`db:migrate`).
