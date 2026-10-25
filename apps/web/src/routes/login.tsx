import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { LoginForm } from '../web-auth/login-form'
import { getLoginOptions } from '../web-auth/login-availability.api'

const loginSearchSchema = z.object({
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  loader: () => getLoginOptions(),
  component: LoginPage,
})

function LoginPage() {
  const { error } = Route.useSearch()
  const options = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm linkError={error !== undefined} magicLinkAvailable={options.magicLink} />
    </main>
  )
}
