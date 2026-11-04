import { useState } from 'react'
import type { FormEvent } from 'react'

import { BUTTON_CLASS, INPUT_CLASS, SIGN_IN_FAILURES } from './login-messages'
import { signInWithPassword } from './web-auth.browser'
import type { SignInOutcome } from './web-auth.browser'

export function PasswordSignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<SignInOutcome | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)

    const submitted = password

    setPassword('')
    setOutcome(await signInWithPassword(email, submitted))
    setPending(false)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      aria-label="Sign in with email and password"
    >
      <label className="text-sm font-medium" htmlFor="login-password-email">
        Email
      </label>
      <input
        id="login-password-email"
        name="email"
        type="email"
        required
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={INPUT_CLASS}
      />
      <label className="text-sm font-medium" htmlFor="login-password">
        Password
      </label>
      <div className="relative">
        <input
          id="login-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${INPUT_CLASS} w-full pr-16`}
        />
        <button
          type="button"
          aria-pressed={showPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          onClick={() => setShowPassword((shown) => !shown)}
          className="absolute inset-y-0 right-0 px-3 text-xs text-neutral-600 hover:text-neutral-900"
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        Sign in
      </button>
      {outcome && outcome !== 'signed_in' ? (
        <p data-testid="login-error" role="alert" className="text-sm text-red-600">
          {SIGN_IN_FAILURES[outcome]}
        </p>
      ) : null}
    </form>
  )
}
