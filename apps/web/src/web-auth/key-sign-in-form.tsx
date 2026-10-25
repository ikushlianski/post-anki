import { useState } from 'react'
import type { FormEvent } from 'react'

import { BUTTON_CLASS, INPUT_CLASS, SIGN_IN_FAILURES } from './login-messages'
import { signInWithKey } from './web-auth.browser'
import type { SignInOutcome } from './web-auth.browser'

export function KeySignInForm() {
  const [key, setKey] = useState('')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<SignInOutcome | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)

    const submitted = key

    setKey('')
    setOutcome(await signInWithKey(submitted))
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Sign in with a key">
      <label className="text-sm font-medium" htmlFor="login-key">
        Device key
      </label>
      <input
        id="login-key"
        name="device-key"
        type="password"
        required
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        className={INPUT_CLASS}
      />
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Sign in with key
      </button>
      {outcome && outcome !== 'signed_in' ? (
        <p data-testid="login-error" role="alert" className="text-sm text-red-600">
          {SIGN_IN_FAILURES[outcome]}
        </p>
      ) : null}
    </form>
  )
}
