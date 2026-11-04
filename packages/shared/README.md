# @post-anki/shared

The contracts between post-anki apps: Zod schemas and the types inferred from them for requests, responses and domain values. The API, web app, bot and extension import from here so every side agrees on one shape.

## Use

Import from the package root:

```ts
import { createSubjectInput, type CreateSubjectInput } from "@post-anki/shared";
```

New schemas are exported through `src/index.ts`.

## Rules

- Validate with Zod; derive types with `z.infer`, never write the type twice.
- Keep pure data and validation here; no I/O and no app-specific code.
- Every schema with a business rule (limits, trimming, allowed values) has a test next to it that names the rule.

## Test

`npx vitest run` in `packages/shared`; `npm run typecheck -w @post-anki/shared` for types.
