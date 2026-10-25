import { useState } from 'react'

import { KeySignInForm } from './key-sign-in-form'
import { MagicLinkForm } from './magic-link-form'
import { PasswordSignInForm } from './password-sign-in-form'

type Method = 'key' | 'password' | 'link'

interface LoginFormProps {
  linkError?: boolean
  magicLinkAvailable?: boolean
}

export function LoginForm({ linkError, magicLinkAvailable = false }: LoginFormProps) {
  const [method, setMethod] = useState<Method>('key')
  const methods: Array<{ id: Method; label: string }> = [
    { id: 'key', label: 'Paste your key' },
    { id: 'password', label: 'Email and password' },
    ...(magicLinkAvailable ? [{ id: 'link' as const, label: 'Email link' }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      {linkError ? (
        <p data-testid="login-link-error" role="alert" className="text-sm text-red-600">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      <div role="group" aria-label="Sign-in method" className="flex flex-wrap gap-2">
        {methods.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={method === id}
            onClick={() => setMethod(id)}
            className={`rounded-md border px-3 py-1 text-sm ${
              method === id ? 'border-neutral-900 font-medium' : 'border-neutral-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {method === 'key' ? <KeySignInForm /> : null}
      {method === 'password' ? <PasswordSignInForm /> : null}
      {method === 'link' && magicLinkAvailable ? <MagicLinkForm /> : null}
    </div>
  )
}
