import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { MODELS, SUBJECTS, hasChildren, labelOf, modelLabelOf } from './lab-data'
import { MODEL_NOTES, SUBJECT_NOTES } from './lab-notes'
import { SelectorLab } from './selector-lab'

const VIEWPORTS = {
  phone: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' as const },
  desktop: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' as const },
}

const leafIds = SUBJECTS.filter((subject) => !hasChildren(subject)).map((subject) => subject.id)

const meta: Meta<typeof SelectorLab> = {
  title: 'Add knowledge/Selector lab',
  component: SelectorLab,
  tags: ['autodocs'],
  args: {
    disabled: false,
    look: 'app',
    modelInitial: '',
    subjectInitial: '',
    allowParentsInitial: false,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    look: {
      control: 'inline-radio',
      options: ['app', 'soft'],
      description: 'app = bordered like the app\'s other fields; soft = grey borderless like the review cards',
    },
    modelInitial: {
      control: { type: 'select', labels: Object.fromEntries([['', 'Nothing chosen'], ...MODELS.map((option) => [option.id, option.label])]) },
      options: ['', ...MODELS.map((option) => option.id)],
    },
    subjectInitial: {
      control: { type: 'select', labels: Object.fromEntries([['', 'Nothing chosen'], ...leafIds.map((id) => [id, labelOf(id)])]) },
      options: ['', ...leafIds],
    },
    allowParentsInitial: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    viewport: { options: VIEWPORTS },
    docs: {
      description: {
        component: `${MODEL_NOTES}\n\n---\n${SUBJECT_NOTES}`,
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof SelectorLab>

export const Desktop1280: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
}

export const Phone390: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
}

export const SoftLook: Story = {
  args: { look: 'soft' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
}

export const KeyboardWalkthrough: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Model, plain select' }), MODELS[1]!.id)
    await expect(canvas.getByTestId('model-a-result')).toHaveTextContent(modelLabelOf(MODELS[1]!.id))

    await userEvent.click(canvas.getByRole('combobox', { name: 'Model, listbox' }))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(canvas.getByTestId('model-c-result')).toHaveTextContent(MODELS[1]!.label)

    await userEvent.type(canvas.getByRole('combobox', { name: 'Subject, searchable list' }), 'sal')
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByTestId('subject-b-result')).toHaveTextContent('Business › Sales')

    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Subject, first step' }), 'sub_business')
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Subject, second step' }), 'sub_hr')
    await expect(canvas.getByTestId('subject-c-result')).toHaveTextContent('Business › HR')
  },
}
