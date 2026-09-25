# Todo: opt-in general knowledge / web search

## Decisions to make
Nothing to decide.

## To review / clarify
Nothing to review.

## Coding tasks
None open.

## Manual steps
No manual steps required.

## Post-deploy checks
No post-deploy checks needed.

## Resolved
- Added allowGeneralKnowledge/allowWebSearch to shared schema — packages/shared/src/knowledge-bit-chat.ts:7-8
- Added knowledge-bit-chat-tools.ts with a searchWeb tool — apps/api/src/mastra/knowledge-bit-chat-tools.ts:21-31
- Made agent instructions/tools dynamic on request flags — apps/api/src/mastra/knowledge-bit-chat.agent.ts:96-108
- Wired flags into a RequestContext from the service — apps/api/src/knowledge-bit/knowledge-bit-chat.service.ts:61-67
- Tests for every scenario in scenarios.md — 5 test files, 28 tests, all passing
