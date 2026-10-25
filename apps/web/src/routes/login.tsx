import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { LoginForm } from '../web-auth/login-form'

const loginSearchSchema = z.object({
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})

function LoginPage() {
  const { error } = Route.useSearch()

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm linkError={error !== undefined} />
    </main>
  )
}
