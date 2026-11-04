import type { ReactNode } from "react";
import type { Subject } from "@/api/desktop-commands";
import type { SubjectsState } from "@/use-subjects";

type SubjectsGateProps = { state: SubjectsState; children: (subjects: Subject[]) => ReactNode };

export function SubjectsGate({ state, children }: SubjectsGateProps) {
  if (state.status === "loading") {
    return (
      <div className="page">
        <p className="muted-text">Loading subjects…</p>
      </div>
    );
  }

  if (state.status === "offline") {
    return (
      <div className="page">
        <p className="notice">You appear to be offline. Subjects could not be loaded.</p>
      </div>
    );
  }

  return <>{children(state.subjects)}</>;
}
