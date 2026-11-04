import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { KnowledgeBitModelBadges } from './knowledge-bit-model-badges'

describe('KnowledgeBitModelBadges', () => {
  it('should show the short name of each model that produced the candidate with the full id on hover', () => {
    render(<KnowledgeBitModelBadges bitId="b1" modelIds={['openai/gpt-5', 'anthropic/claude-x']} />)

    expect(screen.getByText('gpt-5').getAttribute('title')).toBe('openai/gpt-5')
    expect(screen.getByText('claude-x').getAttribute('title')).toBe('anthropic/claude-x')
    expect(screen.getByTestId('knowledge-bit-model-badges-b1').getAttribute('title')).toBe(
      'openai/gpt-5, anthropic/claude-x',
    )
  })

  it('should show nothing for a candidate without model ids', () => {
    render(<KnowledgeBitModelBadges bitId="b1" modelIds={[]} />)

    expect(screen.queryByTestId('knowledge-bit-model-badges-b1')).toBeNull()
  })
})
