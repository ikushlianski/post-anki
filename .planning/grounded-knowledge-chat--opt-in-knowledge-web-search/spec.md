# Spec: opt into general knowledge or a web search from single-item chat

## The ask
Let a learner ask, per message, for single-item chat to also use the model's own general
knowledge and/or a web search, instead of staying grounded on the item's content alone.

## What to do
1. Add `allowGeneralKnowledge?: boolean` and `allowWebSearch?: boolean` to
   `askKnowledgeBitChatInput`.
2. Add `mastra/knowledge-bit-chat-tools.ts` with a `searchWeb` tool, mirroring
   `qa-chat-tools.ts`'s `searchWeb`.
3. Convert `knowledge-bit-chat.agent.ts` to dynamic `instructions`/`tools`, switching on
   `requestContext` flags `allowGeneralKnowledge`/`allowWebSearch`.
4. Update `knowledge-bit-chat.service.ts` to build a `RequestContext` from the two input flags and
   pass `maxSteps` when web search is allowed.

## Files by scenario

| Scenario | Files |
|---|---|
| Neither flag: unchanged grounded-only behavior | `knowledge-bit-chat.agent.ts`, `knowledge-bit-chat.service.test.ts` |
| `allowGeneralKnowledge: true` permits general knowledge | `knowledge-bit-chat.agent.ts` |
| `allowWebSearch: true` can call and cite web search | `mastra/knowledge-bit-chat-tools.ts`, `knowledge-bit-chat.agent.ts`, `knowledge-bit-chat.service.ts` |
| `allowWebSearch` false/omitted: no tool attached | `knowledge-bit-chat.agent.ts` |
| Flags omitted from request body still validate | `packages/shared/src/knowledge-bit-chat.ts` |

## Done when
Every scenario above has a real, passing, non-skipped test; `tsc --noEmit` and the full unit suite
are clean.
