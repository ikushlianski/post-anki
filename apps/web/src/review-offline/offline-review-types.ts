import { reviewGradeSchema, reviewPackSchema } from '@post-anki/shared'
import type { ReviewPack } from '@post-anki/shared'
import { z } from 'zod'

export const MAX_HARD_FAILURES = 5

export const queuedGradeSchema = z.object({
  requestId: z.string().uuid(),
  variantId: z.string().min(1),
  knowledgeBitId: z.string().min(1),
  grade: reviewGradeSchema,
  durationMs: z.number().int().min(0).max(86_400_000),
  tz: z.string().min(1),
  burySiblings: z.boolean(),
  reviewedAt: z.string().datetime({ offset: true }),
  createdAt: z.number(),
  scope: z.string().optional(),
  hardFailures: z.number().int().min(0).default(0),
})

export type QueuedGrade = z.infer<typeof queuedGradeSchema>

export const gradedMarkSchema = z.object({
  variantId: z.string().min(1),
  bitId: z.string().min(1),
  at: z.number(),
})

export type GradedMark = z.infer<typeof gradedMarkSchema>

export const storedPackSchema = z.object({
  savedAt: z.string().datetime({ offset: true }),
  scope: z.string().optional(),
  pack: reviewPackSchema,
  gradedSince: z.array(gradedMarkSchema).default([]),
})

export interface StoredPack {
  savedAt: string
  scope?: string
  pack: ReviewPack
  gradedSince: GradedMark[]
}

export type StoredPackInput = Omit<StoredPack, 'scope'>

export interface RawOfflineStore {
  readPack(): Promise<unknown>
  writePack(value: StoredPack): Promise<void>
  listGrades(): Promise<unknown[]>
  putGrade(grade: QueuedGrade): Promise<void>
  deleteGrade(requestId: string): Promise<void>
  clear(): Promise<void>
}

export interface OfflineReviewStore {
  readPack(): Promise<StoredPack | null>
  writePack(value: StoredPackInput): Promise<boolean>
  listGrades(): Promise<QueuedGrade[]>
  putGrade(grade: QueuedGrade): Promise<boolean>
  hasGrade(requestId: string): Promise<boolean>
  deleteGrade(requestId: string): Promise<void>
  clear(): Promise<void>
}

export type SendOutcome = 'confirmed' | 'retry' | 'rejected'

export interface SendResult {
  outcome: SendOutcome
  reviewId?: string
}

export type SendGrade = (grade: QueuedGrade) => Promise<SendResult>

export function isParkedGrade(grade: QueuedGrade): boolean {
  return grade.hardFailures >= MAX_HARD_FAILURES
}
