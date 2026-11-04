import { createFileRoute } from '@tanstack/react-router'

import { LoginForm } from '../web-auth/login-form'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { expired?: boolean } =>
    search.expired === '1' || search.expired === 1 || search.expired === true ? { expired: true } : {},
  component: LoginPage,
})

function LoginPage() {
  const { expired } = Route.useSearch()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-5 py-10">
      <p data-testid="login-product-name" className="text-3xl font-semibold tracking-tight">
        PostAnki
      </p>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Sign in</h1>
        {expired ? (
          <p role="status" data-testid="login-session-expired" className="mb-4 text-sm text-neutral-600">
            Your session expired. Sign in again to continue.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  )
}
