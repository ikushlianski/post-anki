import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { getTxtImportStatus, uploadTxtFile } from './txt-file-import.api'
import type { TxtImportStatus } from './txt-file-import.api'
import { checkTxtFile } from './txt-file-validation'

const POLL_MS = 3000

export function TxtFileImport({ subjectId }: { subjectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [status, setStatus] = useState<TxtImportStatus | null>(null)
  const finished = status !== null && status.staged === 0 && status.imported > 0 && status.finished >= status.imported

  useEffect(() => {
    if (!importId || finished) return

    let cancelled = false

    async function poll(id: string) {
      try {
        const next = await getTxtImportStatus({ data: { importId: id } })

        if (!cancelled) setStatus(next)
      } catch {
        return
      }
    }

    void poll(importId)

    const timer = setInterval(() => void poll(importId), POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [importId, finished])

  async function importFile(file: File) {
    setError(null)
    setMessage(null)
    setImportId(null)
    setStatus(null)

    const problem = checkTxtFile(file)

    if (problem) {
      setError(problem)

      return
    }

    setBusy(true)

    try {
      const result = await uploadTxtFile({ data: { text: await file.text(), subjectId: subjectId || null } })

      if (result.kind === 'anki') {
        setImportId(result.importId)
        setMessage(`Found ${result.parsed} notes. Import started.`)
      } else {
        setMessage(result.created ? 'File added. Suggestions will appear in review.' : 'This file was already added.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)

    const file = event.dataTransfer.files[0]

    if (file && !busy) void importFile(file)
  }

  return (
    <div
      data-testid="txt-import"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-md border border-dashed p-4 text-sm ${dragging ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
        hidden
        data-testid="txt-import-input"
        onChange={(event) => {
          const file = event.target.files?.[0]

          event.target.value = ''

          if (file) void importFile(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        data-testid="txt-import-button"
        className="inline-flex min-h-[44px] items-center rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 sm:min-h-0"
      >
        {busy ? 'Uploading…' : 'Import a .txt file'}
      </button>
      <span className="ml-3 text-neutral-500">or drop it here. Anki exports and plain text both work.</span>

      {message && <p data-testid="txt-import-message" className="mt-2 text-neutral-700">{message}</p>}

      {status && (
        <p data-testid="txt-import-status" className="mt-1 text-neutral-500">
          {status.staged} waiting, {status.imported} imported, {status.extracted} with suggestions
          {finished ? ' — done' : ''}
        </p>
      )}

      {error && (
        <p role="alert" data-testid="txt-import-error" className="mt-2 text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
