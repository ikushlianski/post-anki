import { useState } from "react";

const COLLAPSE_AT = 120;

export function RejectedCardNote({ id, note }: { id: string; note: string }) {
  const [open, setOpen] = useState(false);
  const long = note.length > COLLAPSE_AT;
  const shown = long && !open ? `${note.slice(0, COLLAPSE_AT).trimEnd()}…` : note;

  return (
    <p
      data-testid={`rejected-card-note-${id}`}
      title={note}
      className="mt-1 whitespace-pre-wrap break-words text-xs text-neutral-600"
    >
      {shown}
      {long ? (
        <button
          type="button"
          data-testid={`rejected-card-note-toggle-${id}`}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="ml-1 text-indigo-600 hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </p>
  );
}
