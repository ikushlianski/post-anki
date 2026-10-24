import { Link } from '@tanstack/react-router'

export function AddKnowledgeButton({ subjectId, className = '' }: { subjectId?: string; className?: string }) {
  return (
    <Link
      to="/add-knowledge"
      search={subjectId ? { subjectId } : {}}
      data-testid="add-knowledge-button"
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 sm:min-h-0 ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        +
      </span>
      Add knowledge
    </Link>
  )
}
