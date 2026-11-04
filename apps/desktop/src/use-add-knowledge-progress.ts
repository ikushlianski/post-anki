import { useCallback, useEffect, useRef, useState } from "react";
import { getKnowledgeSourceStatus } from "@/api/add-knowledge-commands";
import {
  advanceNote,
  isNoteActive,
  NOTE_POLL_INTERVAL_MS,
  newNote,
  type AddedNote,
} from "@/add-knowledge-logic";

export function useAddKnowledgeProgress() {
  const [notes, setNotes] = useState<AddedNote[]>([]);
  const notesRef = useRef(notes);
  const polling = useRef(false);
  const active = notes.some(isNoteActive);

  notesRef.current = notes;

  const track = useCallback((added: { sourceId: string; label: string }[]) => {
    if (added.length === 0) {
      return;
    }

    setNotes((current) => [...current, ...added.map(newNote)]);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    async function poll() {
      if (polling.current) {
        return;
      }

      polling.current = true;

      try {
        const pending = notesRef.current.filter(isNoteActive);
        const settled = await Promise.allSettled(
          pending.map((note) => getKnowledgeSourceStatus(note.sourceId)),
        );
        const updates = new Map<string, AddedNote>();

        pending.forEach((note, index) => {
          const result = settled[index];

          updates.set(note.sourceId, advanceNote(note, result.status === "fulfilled" ? result.value : null));
        });

        setNotes((current) => current.map((note) => updates.get(note.sourceId) ?? note));
      } finally {
        polling.current = false;
      }
    }

    const timer = setInterval(() => void poll(), NOTE_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [active]);

  return { notes, track };
}
