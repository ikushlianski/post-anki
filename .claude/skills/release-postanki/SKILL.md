---
name: release-postanki
description: Ship the current post-anki work to production - API and web via the main-branch CI deploy, the installed Mac app, and both iPhone apps. Trigger on /release-postanki, /postanki-release, /postanki-deploy-prod, "deploy everything", "release to prod", "ship api and apps".
---

# release-postanki

Invoking this skill is the user's go-ahead to commit, merge into main and push main. It does nothing else irreversible.

Model: run this flow, and every alias of it, only through Haiku (a subagent dispatched with `model: "haiku"`); never on a larger model.

1. Gates, once, one at a time (never in parallel; keep the fans quiet): `npm run typecheck`, then `cd apps/web && npx vitest run --maxWorkers=2 --minWorkers=1`, then `cd apps/api && OPENROUTER_API_KEY=test-key LLM_MODE=mock npx vitest run --maxWorkers=2 --minWorkers=1`. Do not run the full integration suite locally; the deploy workflow runs it and blocks the deploy on failure. Locally, run only the integration files for API code changed since `origin/main`, one worker: `cd apps/api && DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects OPENROUTER_API_KEY=test-key LLM_MODE=mock npx vitest run --config vitest.integration.config.ts --maxWorkers=1 --minWorkers=1 <files>`; that needs Docker; start it if it is not running, but never quit it afterwards: other projects rely on it. Any failure stops the release; report it.
2. Commit leftover work with plain conventional messages (no AI attribution, no staging of `.planning/.runs` handoff reports). Never commit secrets.
3. Get the work onto main and push main: from a feature branch, push the branch tip straight to main with `git push origin HEAD:main` (local `main` is stale; it must fast-forward). The `deploy` workflow (`.github/workflows/deploy.yml`) then tests, runs migrations and Pulumi, and deploys API and web; `release.yml` tags a release.
4. Watch it: `gh run list --branch main --limit 3`, then `gh run watch <id> --exit-status` in the background. When it is green, hit `https://postanki.ilya.online/_healthz` (not `/healthz`) and confirm 200. A red job: read `gh run view <id> --log-failed`, fix, push again; do not proceed to the apps until the API is up.
5. Mac app: from `apps/ios`, `scripts/run-mac.sh --test`, then build the Release `PostAnkiMac` scheme (`xcodegen generate`, `xcodebuild -scheme PostAnkiMac -configuration Release -destination 'platform=macOS' -derivedDataPath build MARKETING_VERSION=0.1.<N> CURRENT_PROJECT_VERSION=<N>`, with N taken from the latest tag in `gh release list --limit 1` so the build does not offer a downgrade) and copy the built `PostAnkiMac.app` to `~/Applications/` (replace any old copy) and launch it; quit the old one by its PID only, never `pkill -f`. The first run in a session names the install path it used. Otherwise the Mac app updates itself from the GitHub release.
6. iPhone apps, only after the API is up: from the repo root run, prod then dev, each with a 10-minute timeout: `cd apps/ios && VARIANT=prod scripts/install-iphone.sh 00008110-000C79610A13801E`, then the same with `VARIANT=dev`. The phone must be unlocked and on the Mac's Wi-Fi; if it is unreachable, say so and leave it as the single open item, no retry loop. If the output says "profile has not been explicitly trusted", tell the user to open Settings, General, VPN & Device Management, tap the Apple ID and tap Trust.
7. Report in a few plain sentences: what is live, the run URL, which apps were updated, and anything left (usually the phone).

Order matters: API first, because the new apps expect the new API. Never deploy from a dirty gate, never `--force`, never skip migrations.

Aliases of this skill, all identical: `/postanki-release`, `/postanki-deploy-prod`, `/reinstall-postanki`. Every one of them runs this whole flow: API first, web deployed by CI before any app, then the Mac app and both iPhone apps rebuilt and reinstalled over Wi-Fi.
