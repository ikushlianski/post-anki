import type { StudyMaterial } from '@post-anki/shared'

import { kindLabel } from './study-material-status'

export function StudyMaterialItem({ material }: { material: StudyMaterial }) {
  return (
    <li
      data-testid="study-material-item"
      data-status={material.status}
      data-kind={material.kind}
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {kindLabel(material.kind)}
      </p>

      {material.status === 'generating' ? (
        <p
          data-testid="study-material-generating"
          className="mt-2 text-sm text-neutral-500"
        >
          Generating…
        </p>
      ) : null}

      {material.status === 'failed' ? (
        <p
          data-testid="study-material-failed"
          className="mt-2 text-sm text-amber-700"
        >
          {material.failureReason ??
            'Could not generate this — no usable grounding was found.'}
        </p>
      ) : null}

      {material.status === 'ready' ? (
        <>
          <p
            data-testid="study-material-body"
            className="mt-2 whitespace-pre-wrap text-sm text-neutral-700"
          >
            {material.body}
          </p>

          {material.citations.length > 0 ? (
            <div className="mt-3 border-t border-neutral-200 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Sources
              </p>
              <ul className="mt-2 space-y-1" data-testid="study-material-citations">
                {material.citations.map((citation) => (
                  <li key={citation.url} data-testid="study-material-citation">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-neutral-700 underline"
                    >
                      {citation.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  )
}
