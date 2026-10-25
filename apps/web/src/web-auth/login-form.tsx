import { useState } from 'react'
import type { FormEvent } from 'react'

import { requestMagicLink } from './web-auth.browser'
import type { MagicLinkOutcome } from './web-auth.browser'

const MESSAGES: Record<Exclude<MagicLinkOutcome, 'sent'>, string> = {
  rate_limited: 'Too many attempts. Please try again later.',
  failed: 'Something went wrong. Please try again.',
}

export function LoginForm({ linkError }: { linkError?: boolean }) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<MagicLinkOutcome | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setOutcome(await requestMagicLink(email.trim()))
    setPending(false)
  }

  if (outcome === 'sent') {
    return (
      <p data-testid="login-sent" className="text-sm text-neutral-700">
        Check your inbox. If that address can sign in, a link is on its way.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {linkError ? (
        <p data-testid="login-link-error" role="alert" className="text-sm text-red-600">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      <label className="text-sm font-medium" htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        Email me a sign-in link
      </button>
      {outcome ? (
        <p data-testid="login-error" role="alert" className="text-sm text-red-600">
          {MESSAGES[outcome]}
        </p>
      ) : null}
    </form>
  )
}
