import { useState } from 'react'
import type { FormEvent } from 'react'

import { BUTTON_CLASS, INPUT_CLASS } from './login-messages'
import { requestMagicLink } from './web-auth.browser'
import type { MagicLinkOutcome } from './web-auth.browser'

const MESSAGES: Record<Exclude<MagicLinkOutcome, 'sent'>, string> = {
  rate_limited: 'Too many attempts. Please try again later.',
  failed: 'Something went wrong. Please try again.',
}

export function MagicLinkForm() {
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Sign in with an email link">
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
        className={INPUT_CLASS}
      />
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
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
