# Inngest CLI: see what ran in Inngest Cloud

Goal
- The Inngest CLI is installed and signed in on this Mac so the user can inspect prod (Inngest Cloud) runs from the terminal.

Facts (docs)
- Official CLI: `npx inngest-cli@latest` (https://www.inngest.com/docs/cli, https://www.inngest.com/docs/guides/debug-with-cli).
- Sign-in: `inngest-cli login` opens a browser OAuth approval (`--no-browser` prints the URL); credentials go to the OS keychain; `auth status`, `logout`.
- Cloud inspection: `api --prod --env production get-function-run <run_id>`, `get-function-trace <run_id> --include-output`, `get-event-runs <event_id>`, `rerun <run_id>`.
- No documented "list recent runs" command: runs are looked up by run id or event id. The list view is the Inngest Cloud dashboard (Runs / Traces). Event ids here are deterministic (`<sourceId>:<run>`), so `get-event-runs` works from a known source.

Scope
- In: install the CLI (global npm or pinned `npx`), add a short README section in `apps/api/README.md` with the commands for this app (env slug, example event lookup), optional npm script alias.
- Out: building a run-list tool; self-hosting.

Blocked on user
- The browser OAuth approval (`inngest-cli login`) — only the user can click Approve.

Done when
- `inngest-cli auth status` shows signed in; `inngest-cli api --prod --env production get-event-runs <a business-1 event id>` returns runs.

Assumptions
- The binary name on PATH after npm install is `inngest-cli`; verify after install.
