import { useEffect, useState } from "react";
import { getSubjectBits, type SubjectBit } from "@/api/subject-commands";
import { errorMessage } from "@/shared/error-message";

type SubjectBitListProps = { subjectId: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: SubjectBit[]; hasMore: boolean };

export function SubjectBitList({ subjectId }: SubjectBitListProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    setState({ status: "loading" });
    getSubjectBits(subjectId)
      .then((page) => {
        if (active) setState({ status: "ready", items: page.items, hasMore: page.hasMore });
      })
      .catch((reason: unknown) => {
        if (active) setState({ status: "error", message: errorMessage(reason, "Could not load cards.") });
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  if (state.status === "loading") return <p className="muted-text">Loading cards…</p>;
  if (state.status === "error") return <p role="alert" className="notice notice-error">{state.message}</p>;
  if (state.items.length === 0) return <p className="empty-state">No cards in this subject yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      <ul className="list-group">
        {state.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-body font-medium [overflow-wrap:anywhere]">{item.question}</span>
            <span className="text-body text-muted [overflow-wrap:anywhere]">{item.answer}</span>
          </li>
        ))}
      </ul>
      {state.hasMore ? <p className="muted-text text-caption">Showing the first {state.items.length} cards.</p> : null}
    </div>
  );
}
