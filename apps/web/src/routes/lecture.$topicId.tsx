import { Link, createFileRoute } from '@tanstack/react-router'

import { LecturePanel } from '../curriculum/lecture-panel'
import { NoteCaptureBox } from '../note/note-capture-box'
import { captureNote } from '../note/note.api'
import { StudyMaterialPanel } from '../study-material/study-material-panel'

export const Route = createFileRoute('/lecture/$topicId')({
  component: LecturePage,
})

function LecturePage() {
  const { topicId } = Route.useParams()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 underline">
        Back to curricula
      </Link>
      <div className="mt-4 space-y-6">
        <LecturePanel key={topicId} topicId={topicId} />

        <NoteCaptureBox
          nodeType="topic"
          nodeId={topicId}
          onCapture={(data) => captureNote({ data })}
          onCaptured={() => {}}
        />

        <StudyMaterialPanel topicId={topicId} />
      </div>
    </main>
  )
}
