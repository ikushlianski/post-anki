import { createFileRoute } from '@tanstack/react-router'

import { LoginForm } from '../web-auth/login-form'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm />
    </main>
  )
}
