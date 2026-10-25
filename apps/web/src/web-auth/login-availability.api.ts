import { createServerFn } from '@tanstack/react-start'

export interface LoginOptions {
  magicLink: boolean
}

export function readLoginOptions(env: NodeJS.ProcessEnv = process.env): LoginOptions {
  return { magicLink: env.MAGIC_LINK_ENABLED === '1' }
}

export const getLoginOptions = createServerFn({ method: 'GET' }).handler(
  (): LoginOptions => readLoginOptions(),
)
