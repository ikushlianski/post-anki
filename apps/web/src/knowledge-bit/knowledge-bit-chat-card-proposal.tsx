import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { AiLabelBadge } from './ai-label-badge'
import {
  KnowledgeBitChatCardEditor,
  type EditedCardFields,
} from './knowledge-bit-chat-card-editor'
import type { CardProposalChatMessage, CardProposalStatus } from './knowledge-bit-chat-messages'
import { createKnowledgeItemFromChat } from './knowledge-bit-chat.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'

const BUTTON_CLASS = 'min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-50'

export function KnowledgeBitChatCardProposal({
  knowledgeBitId,
  message,
  superseded,
  revising,
  onStatusChange,
  onRevise,
}: {
  knowledgeBitId: string
  message: CardProposalChatMessage
  superseded: boolean
  revising: boolean
  onStatusChange: (id: string, status: CardProposalStatus) => void
  onRevise: (message: CardProposalChatMessage, instruction: string) => void
}) {
  const { card, status } = message
  const [editing, setEditing] = useState(false)
  const [instruction, setInstruction] = useState('')

  const saveMutation = useMutation({
    mutationFn: (fields: EditedCardFields) =>
      createKnowledgeItemFromChat({
        data: {
          knowledgeBitId,
          front: fields.front.trim(),
          back: fields.back.trim(),
          example: fields.example.trim() === '' ? undefined : fields.example.trim(),
          aiGenerated: card.usedWebSearch,
          sourceLinks: card.usedWebSearch ? card.sources : [],
        },
      }),
  })

  function approve(fields: EditedCardFields) {
    saveMutation.mutate(fields, {
      onSuccess: () => {
        setEditing(false)
        onStatusChange(message.id, 'saved')
        notifyPendingReviewChanged()
      },
    })
  }

  if (status === 'saved') {
    return (
      <p data-testid="knowledge-bit-chat-card-saved" className="text-sm text-green-700">
        Saved, waiting in review
      </p>
    )
  }

  if (status === 'rejected') {
    return (
      <p data-testid="knowledge-bit-chat-card-discarded" className="text-sm text-neutral-500">
        Discarded
      </p>
    )
  }

  const disabled = superseded || saveMutation.isPending || revising

  return (
    <div
      data-testid="knowledge-bit-chat-card-proposal"
      className="w-full space-y-2 rounded-lg border border-neutral-300 bg-white p-3 text-sm"
    >
      {editing ? (
        <KnowledgeBitChatCardEditor
          card={card}
          saving={saveMutation.isPending}
          onSave={approve}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p data-testid="knowledge-bit-chat-card-front" className="whitespace-pre-wrap font-medium">
            {card.front}
          </p>
          <p data-testid="knowledge-bit-chat-card-back" className="whitespace-pre-wrap">
            {card.back}
          </p>
          {card.example ? (
            <p
              data-testid="knowledge-bit-chat-card-example"
              className="whitespace-pre-wrap text-neutral-500"
            >
              {card.example}
            </p>
          ) : null}
          <AiLabelBadge
            isAiGenerated={card.usedWebSearch}
            sourceLinks={card.sources}
            testIdSuffix="-card"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="knowledge-bit-chat-card-approve"
              disabled={disabled}
              onClick={() =>
                approve({ front: card.front, back: card.back, example: card.example ?? '' })
              }
              className={`${BUTTON_CLASS} bg-neutral-900 text-white`}
            >
              {saveMutation.isPending ? 'Saving…' : 'Approve'}
            </button>
            <button
              type="button"
              data-testid="knowledge-bit-chat-card-edit"
              disabled={disabled}
              onClick={() => setEditing(true)}
              className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
            >
              Edit
            </button>
            <button
              type="button"
              data-testid="knowledge-bit-chat-card-reject"
              disabled={disabled}
              onClick={() => onStatusChange(message.id, 'rejected')}
              className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
            >
              Reject
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Ask for changes"
              placeholder="Ask for changes…"
              data-testid="knowledge-bit-chat-card-revise-input"
              value={instruction}
              disabled={disabled}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-11 flex-1 rounded-md border border-neutral-300 px-3 text-sm disabled:bg-neutral-100"
            />
            <button
              type="button"
              data-testid="knowledge-bit-chat-card-revise"
              disabled={disabled || instruction.trim() === ''}
              onClick={() => {
                onRevise(message, instruction.trim())
                setInstruction('')
              }}
              className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
            >
              Revise
            </button>
          </div>
        </>
      )}
      {saveMutation.isError ? (
        <p role="alert" data-testid="knowledge-bit-chat-card-save-error" className="text-xs text-red-600">
          Could not save the card — try again.
        </p>
      ) : null}
    </div>
  )
}
