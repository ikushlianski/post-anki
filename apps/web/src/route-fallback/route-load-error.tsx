import { Link, useRouter } from '@tanstack/react-router'

import type { ErrorComponentProps } from '@tanstack/react-router'

export function RouteLoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  console.error('Route failed to load', error)

  function retry() {
    reset()
    void router.invalidate()
  }

  return (
    <div role="alert" data-testid="route-load-error" className="mx-auto max-w-lg px-5 py-16 sm:px-8">
      <h1 className="text-xl font-semibold">We could not load this page</h1>
      <p className="mt-2 text-neutral-600">
        Something went wrong while getting your data. Try again, or go back to the home page.
      </p>
      <div className="mt-6 flex items-center gap-x-4">
        <button
          type="button"
          data-testid="route-load-error-retry"
          className="rounded bg-neutral-900 px-4 py-2 text-white"
          onClick={retry}
        >
          Retry
        </button>
        <Link to="/" data-testid="route-load-error-home" className="underline">
          Back to home
        </Link>
      </div>
    </div>
  )
}
