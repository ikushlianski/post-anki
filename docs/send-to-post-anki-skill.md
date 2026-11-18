# Send an AI session or explanation to Post Anki

Skill for Claude Code (or any MCP client) connected to the Post Anki MCP server with a token that has the `knowledge:write` scope.

## Trigger

The learner says "send this to Post Anki" after a working session or an AI chat.

## Steps

1. Condense what was learned into one to five short lessons: decisions, concepts, gotchas, and why. Never paste the raw transcript.
2. Leave out secrets, tokens, credentials, private personal data and unrelated client data.
3. Pick a subject path (max two levels, e.g. `Work/AIPeak`) and call `submit_knowledge_to_subject`. Use `submit_knowledge` only for a business deck name.
4. Set `sourceKind` to `ai-session` (working session) or `ai-explanation` (AI answer), and `origin` to the tool and title, e.g. `Claude Code: migrating auth to JWT`.
5. Give each lesson a stable key (`^[a-z0-9:_-]{8,80}$`, e.g. `ai:<session-slug>-1`) so a retry adds nothing.
6. Report the counts back. The notes become pending knowledge sources and are turned into cards for review in Post Anki; `list_knowledge_sources` shows the `kind` and `origin` of each.
