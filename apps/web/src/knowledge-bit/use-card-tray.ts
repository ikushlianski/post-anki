import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
} from '@post-anki/shared'

import { createKnowledgeItemFromChat, draftKnowledgeBitChat } from './knowledge-bit-chat.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'

export type TrayField = 'front' | 'back' | 'example'

export interface TrayFields {
  front: string
  back: string
  example: string
}

export const TRAY_LIMITS: Record<TrayField, number> = {
  front: MANUAL_ITEM_FRONT_MAX_CHARS,
  back: MANUAL_ITEM_BACK_MAX_CHARS,
  example: MANUAL_ITEM_EXAMPLE_MAX_CHARS,
}

const EMPTY_FIELDS: TrayFields = { front: '', back: '', example: '' }

export function makeFactInstruction(selection: string): string {
  return `Write one short question for a flashcard front. The question must be answered exactly by this text, which is the card back:\n"""\n${selection}\n"""`
}

export function useCardTray(knowledgeBitId: string) {
  const [fields, setFields] = useState<TrayFields>(EMPTY_FIELDS)
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const factRequestId = useRef(0)

  const saveMutation = useMutation({
    mutationFn: (values: TrayFields) =>
      createKnowledgeItemFromChat({
        data: {
          knowledgeBitId,
          front: values.front.trim(),
          back: values.back.trim(),
          example: values.example.trim() === '' ? undefined : values.example.trim(),
          aiGenerated: false,
          sourceLinks: [],
        },
      }),
  })

  const factMutation = useMutation({
    mutationFn: (instruction: string) =>
      draftKnowledgeBitChat({
        data: {
          knowledgeBitId,
          mode: 'create',
          transcript: [],
          instruction,
          allowWebSearch: false,
        },
      }),
  })

  const filledCount = Object.values(fields).filter((value) => value.trim() !== '').length
  const canCreate = fields.front.trim() !== '' && fields.back.trim() !== ''

  function setField(field: TrayField, value: string) {
    setSaved(false)
    setFields((prev) => ({ ...prev, [field]: value.slice(0, TRAY_LIMITS[field]) }))
  }

  function useSelectionAs(field: TrayField, selection: string) {
    setField(field, selection)
    setOpen(true)
  }

  function makeFact(selection: string) {
    const back = selection.slice(0, TRAY_LIMITS.back)

    setSaved(false)
    setFields((prev) => ({ ...prev, back }))
    setOpen(true)
    factRequestId.current += 1

    const requestId = factRequestId.current

    factMutation.mutate(makeFactInstruction(back), {
      onSuccess: (result) => {
        if (requestId !== factRequestId.current) return

        const front = result.card.front.slice(0, TRAY_LIMITS.front)

        if (front.trim() === '') return

        setFields((prev) => ({ ...prev, front }))
      },
    })
  }

  function clear() {
    factRequestId.current += 1
    setFields(EMPTY_FIELDS)
    setSaved(false)
    saveMutation.reset()
    factMutation.reset()
  }

  function create() {
    saveMutation.mutate(fields, {
      onSuccess: () => {
        setFields(EMPTY_FIELDS)
        setSaved(true)
        notifyPendingReviewChanged()
      },
    })
  }

  return {
    fields,
    open,
    setOpen,
    saved,
    filledCount,
    canCreate,
    saving: saveMutation.isPending,
    saveFailed: saveMutation.isError,
    makingFact: factMutation.isPending,
    factFailed: factMutation.isError,
    setField,
    useSelectionAs,
    makeFact,
    clear,
    create,
  }
}

export type CardTray = ReturnType<typeof useCardTray>
