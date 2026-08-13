import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { captureNoteInput, concernSchema, noteNodeTypeSchema } from '@post-anki/shared'

import * as api from './note.api-client'

const listNotesForNodeInput = z.object({
  nodeType: noteNodeTypeSchema,
  nodeId: z.string().min(1),
})

const searchNotesInput = z.object({
  query: z.string(),
  concern: concernSchema.optional(),
  domainNodeId: z.string().optional(),
})

const reviewNoteInput = z.array(z.string()).optional().default([])

export const captureNote = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => captureNoteInput.parse(data))
  .handler(({ data }) => api.captureNote(data))

export const listNotesForNode = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => listNotesForNodeInput.parse(data))
  .handler(({ data }) => api.listNotesForNode(data.nodeType, data.nodeId))

export const searchNotes = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => searchNotesInput.parse(data))
  .handler(({ data }) => api.searchNotes(data))

export const reviewNote = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => reviewNoteInput.parse(data))
  .handler(({ data }) => api.reviewNote(data))
