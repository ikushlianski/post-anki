import { useEffect, useState, type FormEvent } from 'react'
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
} from '@post-anki/shared'

const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  'knowledge:write': 'Add knowledge (notes and sources)',
  'cards:write': 'Create and edit cards',
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'
}

export function ApiTokensSection({
  onList,
  onCreate,
  onRevoke,
}: {
  onList: () => Promise<{ tokens: ApiTokenSummary[] }>
  onCreate: (input: { name: string; scopes: ApiTokenScope[] }) => Promise<CreatedApiToken>
  onRevoke: (id: string) => Promise<unknown>
}) {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiTokenScope[]>(['knowledge:write'])
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setTokens((await onList()).tokens)
    } catch {
      setError("Couldn't load your API keys.")
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      setError('Give the key a name.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      setCreated(await onCreate({ name: name.trim(), scopes }))
      setCopied(false)
      setName('')
      await refresh()
    } catch {
      setError("Couldn't create the key. Try again.")
    }

    setBusy(false)
  }

  async function revoke(id: string) {
    setError(null)

    try {
      await onRevoke(id)
      await refresh()
    } catch {
      setError("Couldn't revoke the key. Try again.")
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setError('Copy failed. Select the key and copy it by hand.')
    }
  }

  function toggleScope(scope: ApiTokenScope, checked: boolean) {
    setScopes((current) => (checked ? [...current, scope] : current.filter((item) => item !== scope)))
  }

  return (
    <section data-testid="api-tokens-section" className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">API keys</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Keys let tools such as Claude connect to your cards over MCP. A key is shown once, right after you create it.
      </p>

      {created ? (
        <div data-testid="api-token-created" role="status" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code data-testid="api-token-value" className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1">
              {created.token}
            </code>
            <button
              type="button"
              data-testid="api-token-copy"
              onClick={() => void copy(created.token)}
              className="rounded-md bg-neutral-900 px-3 py-1 text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            data-testid="api-token-dismiss"
            onClick={() => setCreated(null)}
            className="mt-2 text-xs underline"
          >
            I have saved it
          </button>
        </div>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-2">
        <label htmlFor="api-token-name" className="text-sm text-neutral-500">
          Key name
        </label>
        <input
          id="api-token-name"
          data-testid="api-token-name"
          value={name}
          maxLength={API_TOKEN_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          className="block w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <fieldset className="space-y-1">
          <legend className="text-sm text-neutral-500">Allowed to</legend>
          {API_TOKEN_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid={`api-token-scope-${scope}`}
                checked={scopes.includes(scope)}
                onChange={(event) => toggleScope(scope, event.target.checked)}
              />
              {SCOPE_LABELS[scope]}
            </label>
          ))}
          <p className="text-xs text-neutral-500">Every key can read your cards.</p>
        </fieldset>
        <button
          type="submit"
          data-testid="api-token-create"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Create key
        </button>
      </form>

      {error ? (
        <p role="alert" data-testid="api-tokens-error" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <ul data-testid="api-token-list" className="mt-4 space-y-2">
        {tokens.map((token) => (
          <li key={token.id} data-testid={`api-token-${token.id}`} className="rounded-md border border-neutral-200 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{token.name}</span>
              {token.revokedAt ? (
                <span className="text-xs text-neutral-500">Revoked</span>
              ) : (
                <button
                  type="button"
                  data-testid={`api-token-revoke-${token.id}`}
                  onClick={() => void revoke(token.id)}
                  className="text-xs text-red-600 underline"
                >
                  Revoke
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {token.scopes.length > 0 ? token.scopes.join(', ') : 'read only'} · created{' '}
              {formatDate(token.createdAt)} · last used {formatDate(token.lastUsedAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
