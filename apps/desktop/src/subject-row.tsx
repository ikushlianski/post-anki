import type { KeyboardEvent } from "react";
import type { Subject } from "@/api/desktop-commands";

type SubjectRowProps = {
  subject: Subject;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onReview: (subject: Subject) => void;
  onOpen: (subject: Subject) => void;
  onAddChild: (subject: Subject) => void;
};

const INDENT_PX = 24;

const ACTION_CLASS =
  "btn btn-quiet px-3 text-caption text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-text";

export function SubjectRow({
  subject,
  depth,
  hasChildren,
  isOpen,
  onToggle,
  onReview,
  onOpen,
  onAddChild,
}: SubjectRowProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    onReview(subject);
  }

  return (
    <li
      tabIndex={0}
      aria-label={subject.name}
      onKeyDown={handleKeyDown}
      className="group flex min-h-12 items-center gap-1 bg-surface pr-2 hover:bg-hover focus-visible:-outline-offset-2"
      style={{ paddingInlineStart: 4 + depth * INDENT_PX }}
    >
      {hasChildren ? (
        <button
          type="button"
          className="btn btn-quiet btn-icon text-muted hover:bg-transparent hover:text-text"
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${subject.name}`}
          aria-expanded={isOpen}
          onClick={() => onToggle(subject.id)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="M4 2.5 8 6l-4 3.5z" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <span className="w-11 shrink-0" aria-hidden="true" />
      )}
      <button
        type="button"
        className="min-h-11 min-w-0 flex-1 rounded-control bg-transparent px-1 text-left text-body font-medium text-text [overflow-wrap:anywhere] hover:filter-none"
        onClick={() => onReview(subject)}
      >
        {subject.name}
      </button>
      <button
        type="button"
        className={ACTION_CLASS}
        aria-label={`Add sub-subject to ${subject.name}`}
        onClick={() => onAddChild(subject)}
      >
        + Sub
      </button>
      <button
        type="button"
        className={ACTION_CLASS}
        aria-label={`Details of ${subject.name}`}
        onClick={() => onOpen(subject)}
      >
        Details
      </button>
    </li>
  );
}
