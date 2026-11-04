import { useOnlineStatus } from '../shared/use-online-status'

export function OfflineBanner() {
  const online = useOnlineStatus()

  if (online) {
    return null
  }

  return (
    <p
      role="status"
      data-testid="offline-banner"
      className="bg-amber-100 px-5 py-2 text-center text-sm text-amber-900"
    >
      You are offline. Changes wait until the connection is back.
    </p>
  )
}
