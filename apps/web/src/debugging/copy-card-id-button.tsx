import { useState } from 'react'

import { useShowCardIds } from './show-card-ids-preference'

export function CopyCardIdButton({ id }: { id: string }) {
  const [enabled] = useShowCardIds()
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!enabled) {
    return null
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(id)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <button
      type="button"
      data-testid="copy-card-id"
      title={id}
      onClick={() => void copy()}
      className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-200 px-2 py-1 text-xs sm:min-h-0"
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy card id'}
    </button>
  )
}
