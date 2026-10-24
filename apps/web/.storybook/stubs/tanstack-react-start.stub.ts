// Browser stand-in for @tanstack/react-start. Its server runtime (AsyncLocalStorage)
// cannot load in the Storybook bundle, but the *.api.ts modules only call createServerFn
// at import time. Stories pass data through props, so calling a server function rejects.

type ServerFnCall = (...args: unknown[]) => Promise<never>

interface ServerFnBuilder {
  inputValidator: (...args: unknown[]) => ServerFnBuilder
  middleware: (...args: unknown[]) => ServerFnBuilder
  handler: (...args: unknown[]) => ServerFnCall
}

const unavailable: ServerFnCall = () =>
  Promise.reject(new Error('Server functions are not available in Storybook'))

function createBuilder(): ServerFnBuilder {
  const builder: ServerFnBuilder = {
    inputValidator: () => builder,
    middleware: () => builder,
    handler: () => unavailable,
  }
  return builder
}

export function createServerFn(_options?: unknown): ServerFnBuilder {
  return createBuilder()
}
