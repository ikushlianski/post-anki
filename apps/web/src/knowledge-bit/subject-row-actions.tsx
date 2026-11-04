import type { Subject } from '../curriculum/model'
import { SubjectRowMenu } from '../dashboard/subject-row-menu'
import { createSubject, deleteSubject, updateSubjectName, updateSubjectParent } from '../subject/subject.api'

async function succeeded(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action()

    return true
  } catch {
    return false
  }
}

export function SubjectRowActions({ subject, allSubjects }: { subject: Subject; allSubjects: Subject[] }) {
  return (
    <SubjectRowMenu
      subject={subject}
      allSubjects={allSubjects}
      onRename={(subjectId, name) => succeeded(() => updateSubjectName({ data: { subjectId, name } }))}
      onDelete={(subjectId) => succeeded(() => deleteSubject({ data: subjectId }))}
      onCreateSubSubject={(parentId, name) =>
        succeeded(() => createSubject({ data: { name, kind: 'architecture-mentor', parentId } }))
      }
      onMoveSubject={(subjectId, parentId) => succeeded(() => updateSubjectParent({ data: { subjectId, parentId } }))}
    />
  )
}
