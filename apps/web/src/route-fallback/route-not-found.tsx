import { Link } from '@tanstack/react-router'

export function RouteNotFound() {
  return (
    <div data-testid="route-not-found" className="mx-auto max-w-lg px-5 py-16 sm:px-8">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-neutral-600">
        We could not find the page you were looking for. It may have moved or the address may be
        wrong.
      </p>
      <div className="mt-6">
        <Link to="/" data-testid="route-not-found-home" className="underline">
          Back to home
        </Link>
      </div>
    </div>
  )
}
