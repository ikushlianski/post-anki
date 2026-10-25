import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within, expect } from 'storybook/test'
import type { KnowledgeItemModelId } from '@post-anki/shared'

import { ExtractionModelSelect } from '../../knowledge-bit/extraction-model-select'
import { useKnowledgeSubjectChoice } from '../../knowledge-source/use-knowledge-subject-choice'
import { SearchableSelect } from '../../ui/searchable-select'
import { SUBJECTS } from './lab-data'

const VIEWPORTS = {
  phone: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' as const },
  desktop: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' as const },
}

function SharedSelects({
  initialSubjectId,
}: {
  initialSubjectId?: string
}) {
  const [modelId, setModelId] = useState<KnowledgeItemModelId | ''>('')
  const choice = useKnowledgeSubjectChoice([...SUBJECTS], initialSubjectId)

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-8">
      <label className="block space-y-1 text-sm text-neutral-700">
        <span>Subject</span>
        <SearchableSelect
          clearable
          ariaLabel="Subject for these sources"
          testId="story-subject"
          options={choice.options}
          value={choice.selectedSubjectId}
          onChange={choice.chooseSubject}
          placeholder="No subject — type to search"
        />
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-500 sm:min-h-0">
        <input
          type="checkbox"
          checked={choice.allowParents}
          onChange={(event) => choice.setAllowParents(event.target.checked)}
        />
        <span>Also allow parent subjects</span>
      </label>
      {choice.parentHintName ? (
        <p className="text-xs text-neutral-500">Pick a sub-subject of {choice.parentHintName}</p>
      ) : null}
      <div className="space-y-1 text-sm text-neutral-700">
        <span>Model</span>
        <ExtractionModelSelect
          ariaLabel="Model that will parse this knowledge"
          testId="story-model"
          emptyLabel="Choose a model"
          value={modelId}
          onChange={setModelId}
        />
      </div>
      <p data-testid="story-result" className="text-xs text-neutral-500">
        {choice.selectedLabel ?? 'No subject'} / {modelId || 'no model'}
      </p>
    </div>
  )
}

const meta: Meta<typeof SharedSelects> = {
  title: 'Add knowledge/Searchable select',
  component: SharedSelects,
  parameters: { layout: 'fullscreen', viewport: { options: VIEWPORTS } },
}

export default meta

type Story = StoryObj<typeof SharedSelects>

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
}

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
}

export const OpenedFromParentSubject: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: { initialSubjectId: 'sub_business' },
}

export const KeyboardWalkthrough: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByTestId('story-subject'), 'sal')
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByTestId('story-subject')).toHaveValue('Business › Sales')

    await userEvent.type(canvas.getByTestId('story-model'), 'zzz')
    await expect(canvas.getByTestId('story-model-empty')).toBeVisible()
    await userEvent.clear(canvas.getByTestId('story-model'))
    await userEvent.type(canvas.getByTestId('story-model'), 'google{ArrowDown}{Enter}')
    await expect(canvas.getByTestId('story-result')).toHaveTextContent('Business › Sales')
  },
}
