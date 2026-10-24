import { Link } from '@tanstack/react-router'

import { openGlobalCardChat } from '../global-card-chat/global-card-chat-events'

const optionClass =
  'flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50'

function focusSubjectSearch(): void {
  document.querySelector<HTMLInputElement>('[data-testid="global-search-input"]')?.focus()
}

export function HomeOptions() {
  return (
    <div data-testid="home-options" className="mb-6 flex flex-col gap-2">
      <Link
        to="/knowledge/review"
        data-testid="home-start-review"
        className="flex w-full items-center justify-between rounded-lg bg-neutral-900 px-4 py-4 text-base font-semibold text-white hover:bg-neutral-800"
      >
        Start review
      </Link>
      <button type="button" data-testid="home-search-subjects" onClick={focusSubjectSearch} className={optionClass}>
        Search subjects
      </button>
      <button type="button" data-testid="home-chat-with-subject" onClick={openGlobalCardChat} className={optionClass}>
        Chat with a subject
      </button>
    </div>
  )
}
