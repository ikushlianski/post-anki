// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

import { getDomainMapForSubject } from '../domain-map/domain-map.api'
import { CurriculumSettingsPanel } from './curriculum-settings-panel'
import type { Curriculum } from './model'

vi.mock('../domain-map/domain-map.api', () => ({ getDomainMapForSubject: vi.fn() }))

afterEach(cleanup)

describe('CurriculumSettingsPanel', () => {
  it('should stay hidden without an unhandled error when the domain map fails to load', async () => {
    const unhandled = vi.fn()

    process.on('unhandledRejection', unhandled)
    vi.mocked(getDomainMapForSubject).mockRejectedValue(new Error('boom'))

    const { container } = render(
      <CurriculumSettingsPanel
        curriculum={{ id: 'c1', subjectId: 's1', domainNodeId: null } as unknown as Curriculum}
        domainMappings={[]}
        inheritedModelTier="balanced"
        showAdaptive={false}
      />,
    )

    await waitFor(() => expect(getDomainMapForSubject).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(container.innerHTML).toBe('')
    expect(unhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', unhandled)
  })
})
