import { useState } from 'react'

import { highlightCode } from './highlight-code'
import { useCodeWrapPreference } from './use-code-wrap-preference'

const BUTTON_CLASS = 'rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100'

export function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const [wrap, toggleWrap] = useCodeWrapPreference()
  const [copied, setCopied] = useState(false)
  const highlighted = highlightCode(code, language)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div data-testid="code-block" className="code-block my-2 rounded-md border border-neutral-200 bg-neutral-50 text-left">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-2 py-1">
        <span data-testid="code-block-language" className="font-mono text-xs text-neutral-500">
          {language ?? 'code'}
        </span>
        <span className="flex gap-1">
          <button type="button" data-testid="code-block-wrap" aria-pressed={wrap} onClick={toggleWrap} className={BUTTON_CLASS}>
            {wrap ? 'Wrap: on' : 'Wrap: off'}
          </button>
          <button type="button" data-testid="code-block-copy" onClick={() => void copy()} className={BUTTON_CLASS}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      <pre
        data-testid="code-block-pre"
        data-wrap={wrap ? 'on' : 'off'}
        className={`m-0 overflow-x-auto p-3 font-mono text-sm leading-relaxed ${
          wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
        }`}
      >
        {highlighted !== null ? (
          <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  )
}
