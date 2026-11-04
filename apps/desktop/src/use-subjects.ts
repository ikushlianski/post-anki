import { useEffect, useState } from "react";
import { getSubjects, type Subject } from "@/api/desktop-commands";

export type SubjectsState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; subjects: Subject[] };

let current: SubjectsState = { status: "loading" };
const listeners = new Set<() => void>();

function publish(next: SubjectsState) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function reloadSubjects(): Promise<void> {
  return getSubjects()
    .then((subjects) => publish({ status: "ready", subjects }))
    .catch(() => publish({ status: "offline" }));
}

export function useSubjects(): SubjectsState {
  const [state, setState] = useState<SubjectsState>(current);

  useEffect(() => {
    const listener = () => setState(current);

    listeners.add(listener);
    void reloadSubjects();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}
