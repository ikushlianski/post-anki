# iOS vs post-anki API: what the app does not cover

Source of truth: `post-anki/apps/api/src/router-table.ts` (214 routes, full list in `server-routes.txt` next to this file). The app calls 19 of them. Web usage counts come from `rg` over `apps/web/src`.

## Built in this round (one plan folder each)

| Direction | Server routes | Schemas (`packages/shared/src`) | Web uses |
|---|---|---|---|
| `.planning/progress/` — Progress screen and Home stats | `GET /home/summary`, `GET /streak`, `GET /milestones`, `GET /analytics/retention`, `GET /analytics/digest`, `GET /curricula/:id/stats` | `home.ts`, `streak.ts`, `milestone.ts`, `analytics.ts`, `stats.ts` | yes, streak in 14 files |
| `.planning/manage-knowledge/` — browse, edit, suspend, delete, move items | `GET /knowledge-bits/overview`, `PATCH /knowledge-bits/:id`, `PATCH /knowledge-bits/question-variants/:id`, `PATCH /knowledge-bits/:id/schedule`, `GET /knowledge-bits/suspended`, `POST /knowledge-bits/deletions`, `POST /knowledge-bits/moves`, `PATCH /knowledge-bit-feedback/:id` | `knowledge-bit-overview.ts`, `knowledge-bit.ts`, `knowledge-bit-suspended.ts`, `knowledge-bit-review.ts`, `knowledge-bit-review-feedback.ts` | yes |
| `.planning/study-tools/` — ask across all cards, per-topic chat, notes, open questions | `POST /global-card-chat`, `POST /topics/:id/study-chat`, `POST /notes`, `GET /notes/search`, `GET /notes`, `GET /open-questions`, `PATCH /open-questions/:id` | `global-card-chat.ts`, `study-chat.ts`, `note.ts`, `open-questions.ts` | yes |

## Left out, by design or for later

- **Admin and pipeline triggers** (`*-scan`, `/admin/*`, `/doc-scans`, duplicate scans, `/biz-education-distills`, `/mcp`): operator tools that run server jobs, so they stay on web.
- **Course building** (`/curricula` create, sources, research, structure turns, confirm, merge, move, modules/topics create and reorder): a long multi-step AI setup flow that suits a big screen.
- **Domain maps and suggestion triage** (domain nodes, priority, recommendations, curriculum mappings, refocus, subject duplicates): planning tools for organising courses.
- **Other study modes** (probe and socratic sessions, lectures, study materials, study sessions, decide sessions, gaps, learning paths, learning list): later candidates. Probe and socratic sessions fit a phone best.
- **Language practice** (phrase bank, writing checks, practice settings, attempts): a later candidate. The Expo app already reads the phrase bank.
- **Tags, search, daily push, due queue, sources library, content inbox**: later candidates.
- **`/transcriptions`**: iOS dictation already covers it. **`/electric/v1/shape`**: sync service not live.
- **Subject management** (create, rename, delete, reorder, merge, categories): later candidate, low phone value.
