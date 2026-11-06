---
name: release-postanki
description: Ship the current post-anki work to production - API and web via the main-branch CI deploy, the installed Mac app, and both iPhone apps. Trigger on /release-postanki, /postanki-release, /postanki-deploy-prod, "deploy everything", "release to prod", "ship api and apps".
---

# release-postanki

Invoking this skill is the user's go-ahead to commit, merge into main and push main. It does nothing else irreversible.

1. Gates, once: `npm run typecheck`, `cd apps/web && npx vitest run`, `cd apps/api && OPENROUTER_API_KEY=test-key LLM_MODE=mock npx vitest run`, then the integration suite (CI runs it): `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects OPENROUTER_API_KEY=test-key LLM_MODE=mock npx vitest run --config vitest.integration.config.ts`. Any failure stops the release; report it.
2. Commit leftover work with plain conventional messages (no AI attribution, no staging of `.planning/.runs` handoff reports). Never commit secrets.
3. Get the work onto main and push main: from a feature branch, push the branch tip straight to main with `git push origin HEAD:main` (local `main` is stale; it must fast-forward). The `deploy` workflow (`.github/workflows/deploy.yml`) then tests, runs migrations and Pulumi, and deploys API and web; `release.yml` tags a release.
4. Watch it: `gh run list --branch main --limit 3`, then `gh run watch <id> --exit-status` in the background. When it is green, hit `https://postanki.ilya.online/_healthz` (not `/healthz`) and confirm 200. A red job: read `gh run view <id> --log-failed`, fix, push again; do not proceed to the apps until the API is up.
5. Mac app: from `apps/ios`, `scripts/run-mac.sh --test`, then build the Release `PostAnkiMac` scheme (`xcodegen generate`, `xcodebuild -scheme PostAnkiMac -configuration Release -destination 'platform=macOS' -derivedDataPath build`) and copy the built `PostAnkiMac.app` to `~/Applications/` (replace any old copy) and launch it; quit the old one by its PID only, never `pkill -f`. The first run in a session names the install path it used.
6. iPhone apps: run `/reinstall-postanki` (prod then dev over Wi-Fi). If the phone is unreachable, say so and leave it as the single open item; do not retry in a loop.
7. Report in a few plain sentences: what is live, the run URL, which apps were updated, and anything left (usually the phone).

Order matters: API first, because the new apps expect the new API. Never deploy from a dirty gate, never `--force`, never skip migrations.
