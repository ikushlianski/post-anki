import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CardStyleNote, UpdateCardStyleNoteInput } from '@post-anki/shared'

import { listCardStyleNotes, listTriageSubjects, updateCardStyleNote } from './card-triage.api'

const NOTES_KEY = ['card-style-notes'] as const
const SUBJECTS_KEY = ['card-triage-subjects'] as const

export function useStyleNotes() {
  const queryClient = useQueryClient()

  const notes = useQuery({
    queryKey: NOTES_KEY,
    queryFn: async (): Promise<CardStyleNote[]> => {
      const outcome = await listCardStyleNotes({ data: {} })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
  })

  const subjects = useQuery({
    queryKey: SUBJECTS_KEY,
    queryFn: async () => {
      const outcome = await listTriageSubjects()

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
  })

  const update = useMutation({
    mutationFn: async (input: { noteId: string } & UpdateCardStyleNoteInput) => {
      const outcome = await updateCardStyleNote({ data: input })

      if (!outcome.ok) {
        throw new Error(outcome.error)
      }

      return outcome.data
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<CardStyleNote[]>(NOTES_KEY, (previous) =>
        previous?.map((note) => (note.id === saved.id ? saved : note)),
      )
    },
  })

  return { notes, subjects, update }
}
