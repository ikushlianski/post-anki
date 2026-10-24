import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
  createManualKnowledgeItemInput,
  type CreateManualKnowledgeItemInput,
  type PendingKnowledgeBitForReview,
} from '@post-anki/shared'

import { useAutoSave } from './knowledge-bit-review-autosave'

interface DraftFields extends Record<string, string> {
  front: string
  back: string
  example: string
}

export interface DraftFieldRefs {
  front: RefObject<HTMLTextAreaElement | null>
  back: RefObject<HTMLTextAreaElement | null>
  example: RefObject<HTMLTextAreaElement | null>
}

function overLimitMessage(fields: DraftFields): string {
  const checks: [string, number, number][] = [
    ['Front', fields.front.trim().length, MANUAL_ITEM_FRONT_MAX_CHARS],
    ['Back', fields.back.trim().length, MANUAL_ITEM_BACK_MAX_CHARS],
    ['Example', fields.example.trim().length, MANUAL_ITEM_EXAMPLE_MAX_CHARS],
  ]

  return checks
    .filter(([, length, max]) => length > max)
    .map(([label, , max]) => `${label} is over ${max} characters.`)
    .join(' ')
}

export function useDraftSave({
  refs,
  bit,
  onCreate,
  onSaveVariant,
  onSaveBit,
  onBusyChange,
}: {
  refs: DraftFieldRefs
  bit: PendingKnowledgeBitForReview | undefined
  onCreate: (input: CreateManualKnowledgeItemInput) => Promise<boolean>
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}) {
  const saved = useRef<DraftFields>({ front: '', back: '', example: '' })
  const latestBit = useRef(bit)
  const [overLimit, setOverLimit] = useState('')

  latestBit.current = bit

  const readFields = (): DraftFields => ({
    front: refs.front.current?.value ?? '',
    back: refs.back.current?.value ?? '',
    example: refs.example.current?.value ?? '',
  })

  useEffect(() => {
    const timer = window.setInterval(() => setOverLimit(overLimitMessage(readFields())), 250)

    return () => window.clearInterval(timer)
  }, [])

  async function persist(fields: DraftFields): Promise<boolean> {
    const front = fields.front.trim()
    const back = fields.back.trim()
    const example = fields.example.trim()
    const current = latestBit.current
    const variant = current?.variants[0]

    if (!current) {
      const created = await onCreate({ front, back, example: example || undefined })

      if (created) {
        saved.current = { front, back, example }
      }

      return created
    }

    if ((front !== saved.current.front || back !== saved.current.back) && variant) {
      if (!(await onSaveVariant(current.id, variant.id, front, back))) {
        return false
      }

      saved.current = { ...saved.current, front, back }
    }

    if (example !== saved.current.example) {
      if (!(await onSaveBit(current.id, current.body, example || null))) {
        return false
      }

      saved.current = { ...saved.current, example }
    }

    return true
  }

  const status = useAutoSave({
    initial: { front: '', back: '', example: '' },
    read: readFields,
    isValid: (fields) => createManualKnowledgeItemInput.safeParse(fields).success,
    save: persist,
    onBusyChange,
  })

  return { status, overLimit }
}
