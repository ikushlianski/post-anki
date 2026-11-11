import type { ElementType } from 'react'

import { CodeBlock } from './code-block'
import { hasFencedCode, splitFencedCode } from './split-fenced-code'

function trimJoin(text: string, trimStart: boolean, trimEnd: boolean): string {
  let out = text

  if (trimStart) out = out.replace(/^\r?\n/, '')
  if (trimEnd) out = out.replace(/\r?\n$/, '')

  return out
}

export function CardText({
  text,
  as: Tag = 'p',
  className,
  testId,
}: {
  text: string
  as?: ElementType
  className?: string
  testId?: string
}) {
  if (!hasFencedCode(text)) {
    return (
      <Tag data-testid={testId} className={className}>
        {text}
      </Tag>
    )
  }

  const segments = splitFencedCode(text)

  return (
    <div data-testid={testId} className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'code' ? (
          <CodeBlock key={index} code={segment.code} language={segment.language} />
        ) : (
          <span key={index}>
            {trimJoin(segment.text, segments[index - 1]?.kind === 'code', segments[index + 1]?.kind === 'code')}
          </span>
        ),
      )}
    </div>
  )
}

export function CodeBlocksPreview({ text }: { text: string }) {
  if (!hasFencedCode(text)) return null

  return (
    <div data-testid="code-blocks-preview">
      {splitFencedCode(text).map((segment, index) =>
        segment.kind === 'code' ? <CodeBlock key={index} code={segment.code} language={segment.language} /> : null,
      )}
    </div>
  )
}
