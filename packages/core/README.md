# @post-anki/core

Pure domain logic used by the API: progress, recommendation, attempts, gaps, depth, learning status, mastery and similar rules. It has no network, database or framework code, so each rule is a function from input to result.

It depends on `@post-anki/shared` for the input and output shapes and is imported as `@post-anki/core`; the public surface is `src/index.ts`. Folders under `src/` are by domain concept.

## Test

`npx vitest run` in `packages/core`; `npm run typecheck -w @post-anki/core` for types. Tests sit next to the code they cover.
