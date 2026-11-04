import { Link } from '@tanstack/react-router'

import { SignOutButton } from '../web-auth/sign-out-button'

const accountLinkClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 py-1 text-sm sm:min-h-0 sm:min-w-0 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 [&.active]:bg-neutral-900 [&.active]:text-white'

export function AccountLinks() {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1" data-testid="account-links">
      <Link to="/profile" className={accountLinkClass} data-testid="nav-profile">
        Profile
      </Link>
      <SignOutButton className={accountLinkClass} />
    </div>
  )
}
