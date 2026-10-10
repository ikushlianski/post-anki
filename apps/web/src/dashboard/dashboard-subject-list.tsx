import { Link } from '@tanstack/react-router'

import type { Curriculum, Subject } from '../curriculum/model'
import { SubjectRowMenu } from './subject-row-menu'

export interface DashboardSubjectListProps {
  subjects: Subject[]
  curricula: Curriculum[]
  onRenameSubject: (subjectId: string, name: string) => Promise<boolean>
  onDeleteSubject: (subjectId: string) => Promise<boolean>
}

export function DashboardSubjectList({
  subjects,
  curricula,
  onRenameSubject,
  onDeleteSubject,
}: DashboardSubjectListProps) {
  if (subjects.length === 0) {
    return (
      <div data-testid="home-empty-state" className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
        <p className="text-neutral-600">
          You haven't created a subject yet.{' '}
          <Link to="/subjects/new" className="font-medium text-indigo-600 hover:text-indigo-700">
            Create your first subject
          </Link>
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {subjects.map((subject) => {
        const subjectCurricula = curricula.filter((c) => c.subjectId === subject.id)

        return (
          <li
            key={subject.id}
            className="relative rounded-lg border border-neutral-200 bg-white hover:border-neutral-400"
          >
            <Link
              to="/subject/$subjectId"
              params={{ subjectId: subject.id }}
              data-testid="subject-name"
              className="flex items-center justify-between px-4 py-3 pr-14"
            >
              <span className="font-medium tracking-tight">{subject.name}</span>
              <span className="text-sm text-neutral-400">
                {subjectCurricula.length === 0
                  ? 'No curricula yet'
                  : `${subjectCurricula.length} curricul${subjectCurricula.length === 1 ? 'um' : 'a'}`}
              </span>
            </Link>
            <div className="absolute right-2 top-2">
              <SubjectRowMenu
                subject={subject}
                onRename={onRenameSubject}
                onDelete={onDeleteSubject}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
