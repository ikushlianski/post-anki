import { useState } from 'react'

import { signOut } from './web-auth.browser'

export function SignOutButton({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false)

  async function onClick() {
    setFailed(!(await signOut()))
  }

  return (
    <>
      <button type="button" className={className} data-testid="nav-sign-out" onClick={onClick}>
        Sign out
      </button>
      {failed ? (
        <p role="alert" data-testid="nav-sign-out-error" className="px-3 text-xs text-red-600">
          Could not sign out. Try again.
        </p>
      ) : null}
    </>
  )
}
