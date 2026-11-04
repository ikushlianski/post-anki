import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { Block } from './knowledge-form-blocks'
import { readKnowledgeDraft, writeKnowledgeDraft } from './knowledge-draft-storage'

export function useKnowledgeDraft(blocks: Block[], setBlocks: Dispatch<SetStateAction<Block[]>>) {
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const saved = readKnowledgeDraft()

    if (saved) {
      setBlocks(saved)
    }

    setRestored(true)
  }, [setBlocks])

  useEffect(() => {
    if (restored) {
      writeKnowledgeDraft(blocks)
    }
  }, [blocks, restored])
}
