# @post-anki/web

The post-anki web app, built with TanStack Start (file routes), React and Tailwind. It talks to the domain API (`@post-anki/api`) through server functions; the browser never calls the API directly.

## Run

From the repo root:

- `npm run dev:web` starts only this app; `npm run dev` also starts the API, dev Postgres and Electric.
- Port: `WEB_PORT`, default 5540. `npm run dev:e2e -w @post-anki/web` uses `E2E_WEB_PORT`, default 5550.
- `npm run build -w @post-anki/web`, then `npm run start -w @post-anki/web` serves the production build.
- `npm run storybook -w @post-anki/web` starts Storybook on `STORYBOOK_PORT`, default 6006.

Local setup details are in `docs/architecture/local-dev.md`.

## Environment

Server-side only; values live in `.env.local` (gitignored) or the deploy secrets.

- `API_BASE_URL`: address of the API.
- `API_SHARED_SECRET`: bearer secret sent to the API (must match the API's value when the API sets one).

## Test

- `npx vitest run` in `apps/web` (or `npm run test -w @post-anki/web`).
- `npm run typecheck -w @post-anki/web` for types.
- Tests sit next to the file they cover; React components use React Testing Library.
- Browser checks are in `e2e-local/`.

## Folders

`src/` is organised by feature, each folder holding its components, hooks and server functions:

- `routes/`: file-based routes; `routeTree.gen.ts` is generated.
- `knowledge-bit/`, `chat-queue/`, `card-triage/`: cards, Chat queue, Inbox, Rejected and triage.
- `analytics/`, `stats/`: statistics and reports.
- `subject/`, `curriculum/`, `learning-path/`: subjects and what is studied.
- `home/`, `dashboard/`, `nav/`: landing screens and navigation.
- `ui/`, `shared/`, `shortcuts-help/`: shared components and helpers.
- `mocks/`, `storybook/`: test doubles and stories.
