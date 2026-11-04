# post-anki

A personal learning system: notes and sources become cards that are triaged, reviewed and discussed, with clients on the web, iPhone and Mac, Telegram, Chrome, desktop and mobile.

## Apps and packages

| Path | Package | What it is |
| --- | --- | --- |
| `apps/api` | `@post-anki/api` | Domain API: HTTP controllers, Drizzle repositories and the LLM agents. See [apps/api/README.md](apps/api/README.md). |
| `apps/web` | `@post-anki/web` | Web app (TanStack Start). See [apps/web/README.md](apps/web/README.md). |
| `apps/bot` | `@post-anki/bot` | Telegram bot, owner-only. See [apps/bot/README.md](apps/bot/README.md). |
| `apps/ios` | n/a | Native iOS companion app in Swift/SwiftUI. See [apps/ios/README.md](apps/ios/README.md). |
| `apps/extension` | `@post-anki/extension` | Chrome extension that sends a text selection to the API. See [apps/extension/README.md](apps/extension/README.md). |
| `apps/desktop` | `@post-anki/desktop` | Tauri desktop app. |
| `apps/mobile` | `@post-anki/mobile` | Mobile app. |
| `packages/core` | `@post-anki/core` | Pure domain logic shared by the API. |
| `packages/shared` | `@post-anki/shared` | Zod schemas and types shared across apps. |
| `e2e`, `e2e-local` | n/a | Browser checks and the isolated end-to-end stack (`scripts/e2e-stack.sh`). |
| `infra`, `infra-aws` | n/a | Infrastructure code. |

## Run it locally

Details are in [docs/architecture/local-dev.md](docs/architecture/local-dev.md).

1. `npm install` at the repo root.
2. Install Docker (dev Postgres and Electric run in containers).
3. Copy `apps/api/.env.example` to `apps/api/.env.local` and fill what you need.

| Goal | Command |
| --- | --- |
| API, web, dev Postgres and Electric | `npm run dev` |
| Same, with no paid LLM calls | `LLM_MODE=mock npm run dev` |
| Only the API / only the web app | `npm run dev:api` / `npm run dev:web` |
| The Telegram bot | `npm run dev:bot` |
| All workspace tests / typecheck | `npm run test` / `npm run typecheck` |

Ports: API 5560, web 5540, Postgres 5562.

## Docs index

- [docs/ai-evals.md](docs/ai-evals.md): AI prompt evals
- [docs/knowledge-extraction-prompts.md](docs/knowledge-extraction-prompts.md): Knowledge extraction prompts (as sent to the model)
- [docs/study-goals.md](docs/study-goals.md): Study goals and priorities
- [docs/triage-chat-and-reject-reasons.md](docs/triage-chat-and-reject-reasons.md): Triage, Chat queue and reject reasons

### docs/architecture

- [agent-conventions.md](docs/architecture/agent-conventions.md): Agent and tool-call conventions
- [cold-start-options.md](docs/architecture/cold-start-options.md): Cold start options
- [doc-changelog-scan.md](docs/architecture/doc-changelog-scan.md): Periodic doc/changelog scan (issue #49)
- [doc-link-technology-intake.md](docs/architecture/doc-link-technology-intake.md): Architecture: Doc-link technology intake
- [domain-priority-review.md](docs/architecture/domain-priority-review.md): Domain priority review (issue #52)
- [generalize-gap-tracking.md](docs/architecture/generalize-gap-tracking.md): Architecture: Generalized recall-gap mastery tracking
- [learning-map-chat.md](docs/architecture/learning-map-chat.md): Architecture: Learning-map sidebar chat
- [local-dev.md](docs/architecture/local-dev.md): Local development
- [local-first-electric-sync.md](docs/architecture/local-first-electric-sync.md): Architecture: Local-first sync
- [mobile-study-review-app.md](docs/architecture/mobile-study-review-app.md): Mobile study/review app
- [native-sync-decision.md](docs/architecture/native-sync-decision.md): Native app sync: PowerSync vs Electric
- [ontology-split-merge.md](docs/architecture/ontology-split-merge.md): Architecture — Subject, Tag, and Curriculum merge
- [paid-services.md](docs/architecture/paid-services.md): Paid-service inventory
- [phone-layout.md](docs/architecture/phone-layout.md): Phone layout
- [phrase-bank-mastery.md](docs/architecture/phrase-bank-mastery.md): Architecture: Phrase-bank spaced repetition with mastery tracking
- [question-feedback-memory.md](docs/architecture/question-feedback-memory.md): Architecture: Question feedback memory
- [software-factory-review-gate.md](docs/architecture/software-factory-review-gate.md): Architecture: Software factory review gate (Phase 0)
- [study-stats-dashboard.md](docs/architecture/study-stats-dashboard.md): Architecture: Study stats dashboard
- [tauri-desktop-app.md](docs/architecture/tauri-desktop-app.md): Architecture: Tauri desktop app for Post Anki
- [topic-ordering-importance.md](docs/architecture/topic-ordering-importance.md): Architecture: Topic ordering & importance
- [topic-study-experience.md](docs/architecture/topic-study-experience.md): Architecture: Topic study experience
- [use-case-study-mode.md](docs/architecture/use-case-study-mode.md): Use-case study mode
- [ai-duplicate-detection/](docs/architecture/ai-duplicate-detection): design folder
- [assets/](docs/architecture/assets): images used by the architecture docs
- [batch-practice-electric-fallback/](docs/architecture/batch-practice-electric-fallback): design folder
- [check-my-writing-mode/](docs/architecture/check-my-writing-mode): design folder
- [concurrency-and-verification-hardening/](docs/architecture/concurrency-and-verification-hardening): design folder
- [curriculum-merge/](docs/architecture/curriculum-merge): design folder
- [decide-mode/](docs/architecture/decide-mode): design folder
- [decouple-curricula-from-domain-nodes/](docs/architecture/decouple-curricula-from-domain-nodes): design folder
- [doc-changelog-scan/](docs/architecture/doc-changelog-scan): design folder
- [domain-node-merge/](docs/architecture/domain-node-merge): design folder
- [domain-priority-review/](docs/architecture/domain-priority-review): design folder
- [english-batch-practice/](docs/architecture/english-batch-practice): design folder
- [extension/](docs/architecture/extension): design folder
- [generalize-gap-tracking/](docs/architecture/generalize-gap-tracking): design folder
- [knowledge-bit/](docs/architecture/knowledge-bit): design folder
- [migrate-english-practice-data/](docs/architecture/migrate-english-practice-data): design folder
- [mobile-study-loop/](docs/architecture/mobile-study-loop): design folder
- [mobile-token-security/](docs/architecture/mobile-token-security): design folder
- [model-comparison/](docs/architecture/model-comparison): design folder
- [newcomer-onboarding-and-cards/](docs/architecture/newcomer-onboarding-and-cards): design folder
- [ontology-audit-trail/](docs/architecture/ontology-audit-trail): design folder
- [ontology-split-merge/](docs/architecture/ontology-split-merge): design folder
- [phrase-bank-concurrency-fix/](docs/architecture/phrase-bank-concurrency-fix): design folder
- [phrase-bank-mastery/](docs/architecture/phrase-bank-mastery): design folder
- [seed-knowledge-map/](docs/architecture/seed-knowledge-map): design folder
- [seed-static-taxonomy/](docs/architecture/seed-static-taxonomy): design folder
- [separate-progress-overlay-from-structure/](docs/architecture/separate-progress-overlay-from-structure): design folder
- [subject/](docs/architecture/subject): design folder
- [subject-category-nesting/](docs/architecture/subject-category-nesting): design folder
- [subject-pedagogy-kind/](docs/architecture/subject-pedagogy-kind): design folder
- [visual-knowledge-map/](docs/architecture/visual-knowledge-map): design folder
- [web-auth/](docs/architecture/web-auth): design folder
- [workplace-scenario-packs/](docs/architecture/workplace-scenario-packs): design folder

### docs/ci-cd and docs/memories

- [docs/ci-cd/gcp-setup.md](docs/ci-cd/gcp-setup.md): GCP setup, including the one-time Telegram webhook registration.
- [docs/memories/README.md](docs/memories/README.md): index of non-obvious run-and-test facts.
- [docs/memories/e2e-local-convention.md](docs/memories/e2e-local-convention.md): e2e-local — repo-local dev-loop actions and mock LLM.
- [docs/memories/local-dev-env.md](docs/memories/local-dev-env.md): Local dev environment — Postgres + Electric.
