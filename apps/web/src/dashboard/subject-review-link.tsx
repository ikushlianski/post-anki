import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export interface SubjectReviewLinkProps {
  subjectId: string
  testId: string
  className?: string
  role?: 'menuitem'
  children: ReactNode
}

// The one place a subject's review link is built; the ⋯ menu and the subject card both render it.
export function SubjectReviewLink({ subjectId, testId, className, role, children }: SubjectReviewLinkProps) {
  return (
    <Link
      to="/knowledge/review"
      search={{ subjectId }}
      role={role}
      data-testid={testId}
      className={className}
    >
      {children}
    </Link>
  )
}
