import { useState } from 'react'

type ShareStatus = 'idle' | 'copied' | 'failed'

export function ShareCardButton({ text, className }: { text: string; className?: string }) {
  const [status, setStatus] = useState<ShareStatus>('idle')

  async function share() {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
        setStatus('idle')

        return
      }

      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed')
    }
  }

  return (
    <button
      type="button"
      data-testid="anki-review-share"
      title="Send this card to someone as text"
      onClick={() => void share()}
      className={className}
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Share failed' : 'Share card'}
    </button>
  )
}
