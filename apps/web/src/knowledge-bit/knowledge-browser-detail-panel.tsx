import { useEffect } from 'react'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { KnowledgeBrowserDetailBody, KnowledgeBrowserDetailPreview } from './knowledge-browser-detail-body'
import { isTypingTarget } from './knowledge-browser-open-item'
import { KnowledgeBrowserSlideOver } from './knowledge-browser-slide-over'
import { useKnowledgeBrowserDetail } from './use-knowledge-browser-detail'

interface KnowledgeBrowserDetailPanelProps {
  id: string
  row?: KnowledgeBitBrowserItem | null
  onClose: () => void
  getReturnFocus?: () => HTMLElement | null
}

const MAX_TITLE = 60

function useIgnoreDeleteKey() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Delete' && !isTypingTarget(event.target)) {
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

function titleFor(front: string | undefined): string {
  if (!front) {
    return 'Piece details'
  }

  return front.length > MAX_TITLE ? `${front.slice(0, MAX_TITLE).trimEnd()}…` : front
}

export function KnowledgeBrowserDetailPanel({ id, row, onClose, getReturnFocus }: KnowledgeBrowserDetailPanelProps) {
  const { status, detail, retry } = useKnowledgeBrowserDetail(id)

  useIgnoreDeleteKey()

  const front = detail?.phrasings[0]?.prompt ?? row?.phrasings[0]?.prompt

  return (
    <KnowledgeBrowserSlideOver title={titleFor(front)} onClose={onClose} getReturnFocus={getReturnFocus}>
      {status === 'ready' && detail && <KnowledgeBrowserDetailBody detail={detail} />}
      {status === 'missing' && (
        <p data-testid="knowledge-browser-detail-missing" className="text-sm text-neutral-700">
          This piece no longer exists. It may have been deleted. Close this panel to go back to the list.
        </p>
      )}
      {(status === 'pending' || status === 'error') && (
        <>
          {row && <KnowledgeBrowserDetailPreview row={row} />}
          {status === 'pending' && (
            <p data-testid="knowledge-browser-detail-loading" className="text-sm text-neutral-500">
              Loading details…
            </p>
          )}
          {status === 'error' && (
            <div
              role="alert"
              data-testid="knowledge-browser-detail-error"
              className="rounded border border-red-200 bg-red-50 px-3 py-3"
            >
              <p className="text-sm text-red-700">Could not load the details. Check your connection and try again.</p>
              <button
                type="button"
                data-testid="knowledge-browser-detail-retry"
                className="mt-2 rounded bg-neutral-900 px-3 py-1 text-sm text-white"
                onClick={retry}
              >
                Retry
              </button>
            </div>
          )}
        </>
      )}
    </KnowledgeBrowserSlideOver>
  )
}
