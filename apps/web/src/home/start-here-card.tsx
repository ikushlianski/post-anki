import { Link } from '@tanstack/react-router'

export function StartHereCard() {
  return (
    <section data-testid="start-here-card" className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Start here</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-700">
        <li>
          <Link
            to="/add-knowledge"
            search={{}}
            data-testid="start-here-add"
            className="font-medium text-green-700 underline"
          >
            Add knowledge
          </Link>{' '}
          from a note, article or link.
        </li>
        <li>
          Then{' '}
          <Link to="/knowledge/review" data-testid="start-here-review" className="font-medium text-green-700 underline">
            Review
          </Link>{' '}
          the cards it creates.
        </li>
      </ol>
    </section>
  )
}
