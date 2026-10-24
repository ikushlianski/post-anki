export function RoutePending() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="route-pending"
      className="px-5 py-16 text-neutral-500 sm:px-8"
    >
      Loading…
    </div>
  )
}
