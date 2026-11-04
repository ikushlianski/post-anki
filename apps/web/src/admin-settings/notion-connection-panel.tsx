import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { NotionConnectionStatus } from '@post-anki/shared'

import { connectionFailureText } from '../notion-source/notion-failure-text'
import {
  checkNotionConnection,
  getNotionConnection,
  removeNotionToken,
  saveNotionToken,
} from '../notion-source/notion-source.api'

const SECRET_KEY_TEXT =
  'Saving a token needs an encryption key on the server. Set CONNECTOR_SECRET_KEY in the server environment, restart the API, then try again.'

const ORIGIN_TEXT = {
  settings: 'The token is stored in settings.',
  env: 'The token comes from the server environment.',
  none: 'No token is set.',
} as const

export function NotionConnectionPanel() {
  const [status, setStatus] = useState<NotionConnectionStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true

    getNotionConnection()
      .then((result) => {
        if (!active) return

        if (result.ok) setStatus(result.data)
        else setLoadFailed(true)
      })
      .catch(() => active && setLoadFailed(true))

    return () => {
      active = false
    }
  }, [])

  function report(text: string, isError: boolean) {
    setMessage(text)
    setFailed(isError)
  }

  async function save(event: FormEvent) {
    event.preventDefault()

    if (token.trim() === '' || busy) return

    setBusy(true)
    setMessage(null)

    try {
      const result = await saveNotionToken({ data: { token } })

      setToken('')

      if (result.ok) {
        setStatus(result.data)
        report('Token saved.', false)
      } else if (result.code === 'secret_key_missing') {
        report(SECRET_KEY_TEXT, true)
      } else {
        report('Could not save the token. Try again.', true)
      }
    } catch {
      setToken('')
      report('Could not save the token. Try again.', true)
    }

    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    setMessage(null)

    try {
      const result = await removeNotionToken()

      if (result.ok) {
        setStatus(result.data)
        report('Saved token removed.', false)
      } else {
        report('Could not remove the token. Try again.', true)
      }
    } catch {
      report('Could not remove the token. Try again.', true)
    }

    setBusy(false)
  }

  async function check() {
    setBusy(true)
    setMessage(null)

    try {
      const result = await checkNotionConnection()

      if (!result.ok) report('Could not run the check. Try again.', true)
      else if (result.data.ok) {
        report(
          result.data.workspaceName
            ? `Connection works. Workspace: ${result.data.workspaceName}.`
            : 'Connection works.',
          false,
        )
      } else {
        report(connectionFailureText(result.data.reason), true)
      }
    } catch {
      report('Could not run the check. Try again.', true)
    }

    setBusy(false)
  }

  return (
    <section id="notion-connection" data-testid="notion-connection-panel" className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">Notion connection</h2>

      {loadFailed ? (
        <p role="alert" data-testid="notion-connection-load-error" className="mt-1 text-sm text-red-600">
          Could not load the connection state. Reload the page to try again.
        </p>
      ) : status === null ? (
        <p className="mt-1 text-sm text-neutral-500">Loading...</p>
      ) : (
        <>
          <p data-testid="notion-connection-state" className="mt-1 text-sm">
            <strong>{status.configured ? 'Connected' : 'Not connected'}</strong>
            {` - ${ORIGIN_TEXT[status.origin]}`}
          </p>
          {status.canStoreToken ? null : (
            <p data-testid="notion-connection-no-key" className="mt-1 text-sm text-amber-700">
              {SECRET_KEY_TEXT}
            </p>
          )}

          <form onSubmit={(event) => void save(event)} className="mt-3 space-y-2">
            <label className="block text-sm">
              Notion integration token
              <input
                type="password"
                data-testid="notion-connection-token"
                value={token}
                autoComplete="off"
                disabled={busy}
                placeholder="Paste a new token"
                onChange={(event) => setToken(event.target.value)}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 px-2 py-1 text-sm sm:min-h-0"
              />
            </label>
            <p className="text-xs text-neutral-400">A saved token is never shown again.</p>
            <Link
              to="/notion-sources"
              data-testid="notion-connection-sources-link"
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-neutral-900 underline sm:min-h-0"
            >
              Choose Notion sources
            </Link>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                data-testid="notion-connection-save"
                disabled={busy || token.trim() === '' || !status.canStoreToken}
                className="min-h-[44px] rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 sm:min-h-0"
              >
                Save token
              </button>
              <button
                type="button"
                data-testid="notion-connection-check"
                disabled={busy || !status.configured}
                onClick={() => void check()}
                className="min-h-[44px] rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 sm:min-h-0"
              >
                Check connection
              </button>
              {status.origin === 'settings' ? (
                <button
                  type="button"
                  data-testid="notion-connection-disconnect"
                  disabled={busy}
                  onClick={() => void disconnect()}
                  className="min-h-[44px] rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40 sm:min-h-0"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </form>
        </>
      )}

      {message ? (
        <p
          role={failed ? 'alert' : 'status'}
          data-testid="notion-connection-message"
          className={`mt-2 text-sm ${failed ? 'text-red-600' : 'text-neutral-700'}`}
        >
          {message}
        </p>
      ) : null}
    </section>
  )
}
