// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../gamification/level-chip', () => ({
  LevelChip: () => <div data-testid="level-chip" />,
}))

vi.mock('../motivation/goal-progress-chip', () => ({
  GoalProgressChip: () => <div data-testid="goal-progress-chip" />,
}))

vi.mock('../knowledge-source/add-knowledge-button', () => ({
  AddKnowledgeButton: () => <a data-testid="add-knowledge-button" href="/add-knowledge" />,
}))

import { HomeHeader } from './home-header'

afterEach(cleanup)

describe('HomeHeader', () => {
  it('should name the home page Post Anki with the Add knowledge button, goal chip and level chip', () => {
    render(<HomeHeader />)

    expect(screen.getByRole('heading', { level: 1, name: 'Post Anki' })).toBeTruthy()
    expect(screen.getByTestId('add-knowledge-button')).toBeTruthy()
    expect(screen.getByTestId('goal-progress-chip')).toBeTruthy()
    expect(screen.getByTestId('level-chip')).toBeTruthy()
  })
})
