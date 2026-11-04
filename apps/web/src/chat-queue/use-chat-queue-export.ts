import { useCallback, useState } from 'react'

import { chatQueueFailureFromThrown, chatQueueFailureMessage } from './chat-queue-failure'
import { exportChatQueueMarkdown } from './chat-queue.api'

export function useChatQueueExport() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportSubject = useCallback(async (subjectId: string) => {
    setExporting(true)
    setError(null)

    try {
      const outcome = await exportChatQueueMarkdown({ data: { subjectId } })

      if (!outcome.ok) {
        setError(chatQueueFailureMessage(outcome.failure))

        return
      }

      const blob = new Blob([outcome.data.markdown], { type: 'text/markdown;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = href
      link.download = outcome.data.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch {
      setError(chatQueueFailureMessage(chatQueueFailureFromThrown()))
    } finally {
      setExporting(false)
    }
  }, [])

  return { exporting, error, exportSubject }
}
