import { createFileRoute } from '@tanstack/react-router'

import { TagList } from '../subject/tag-list'

export const Route = createFileRoute('/tags')({
  component: TagsPage,
})

function TagsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cross-cutting tags that span multiple subjects — merge related tags
          together to keep your vocabulary consistent.
        </p>
      </header>

      <TagList />
    </main>
  )
}
