import type { SignInOutcome } from './web-auth.browser'

export const SIGN_IN_FAILURES: Record<Exclude<SignInOutcome, 'signed_in'>, string> = {
  rate_limited: 'Too many attempts. Please try again later.',
  failed: 'Could not sign in.',
}

export const INPUT_CLASS = 'rounded-md border border-neutral-300 px-3 py-2 text-sm'
export const BUTTON_CLASS =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50'
