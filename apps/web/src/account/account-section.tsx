import { useState, type FormEvent } from 'react'
import { ACCOUNT_NAME_MAX_LENGTH, accountNameSchema, type Account } from '@post-anki/shared'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function formatLastSignIn(iso: string | null): string {
  if (!iso) {
    return 'Unknown'
  }

  const date = new Date(iso)

  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function AccountSection({
  account,
  onSaveName,
}: {
  account: Account
  onSaveName: (name: string) => Promise<Account>
}) {
  const [name, setName] = useState(account.name)
  const [savedName, setSavedName] = useState(account.name)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()

    const parsed = accountNameSchema.safeParse(name)

    if (!parsed.success) {
      setStatus('error')
      setMessage(`Enter a name between 1 and ${ACCOUNT_NAME_MAX_LENGTH} characters.`)
      return
    }

    setStatus('saving')

    try {
      const updated = await onSaveName(parsed.data)

      setName(updated.name)
      setSavedName(updated.name)
      setStatus('saved')
      setMessage('Saved.')
    } catch {
      setStatus('error')
      setMessage("Couldn't save your name. Try again.")
    }
  }

  return (
    <section data-testid="account-section" className="mb-8 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-lg font-semibold tracking-tight">Account</h2>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-neutral-500">Email</dt>
          <dd data-testid="account-email" className="font-medium text-neutral-900">
            {account.email}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Last sign-in</dt>
          <dd data-testid="account-last-sign-in" className="font-medium text-neutral-900">
            {formatLastSignIn(account.lastSignInAt)}
          </dd>
        </div>
      </dl>
      <form onSubmit={(event) => void submit(event)} className="mt-3">
        <label htmlFor="account-name" className="text-sm text-neutral-500">
          Display name
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="account-name"
            data-testid="account-name-input"
            value={name}
            maxLength={ACCOUNT_NAME_MAX_LENGTH + 20}
            onChange={(event) => {
              setName(event.target.value)
              setStatus('idle')
            }}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            data-testid="account-name-save"
            disabled={status === 'saving' || name.trim() === savedName}
            className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {status === 'saved' || status === 'error' ? (
          <p
            role={status === 'error' ? 'alert' : 'status'}
            data-testid="account-name-feedback"
            className={status === 'error' ? 'mt-1 text-xs text-red-600' : 'mt-1 text-xs text-green-700'}
          >
            {message}
          </p>
        ) : null}
      </form>
    </section>
  )
}
