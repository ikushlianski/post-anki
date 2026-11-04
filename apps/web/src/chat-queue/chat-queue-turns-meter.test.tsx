import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatQueueTurnsMeter } from './chat-queue-turns-meter'

function filled() {
  return screen
    .getAllByTestId('chat-queue-turn-pip')
    .filter((pip) => pip.getAttribute('data-filled') === 'true').length
}

describe('ChatQueueTurnsMeter', () => {
  it('should show how many of the 8 turns are left without a warning at the start', () => {
    render(<ChatQueueTurnsMeter turnsLeft={8} />)

    expect(screen.getByRole('img', { name: '8 of 8 turns left' })).toBeTruthy()
    expect(screen.getAllByTestId('chat-queue-turn-pip')).toHaveLength(8)
    expect(filled()).toBe(0)
    expect(screen.queryByTestId('chat-queue-turns-note')).toBeNull()
  })

  it('should fill one pip per used turn', () => {
    render(<ChatQueueTurnsMeter turnsLeft={5} />)

    expect(screen.getByRole('img', { name: '5 of 8 turns left' })).toBeTruthy()
    expect(filled()).toBe(3)
  })

  it('should warn the learner that the next question is the last one', () => {
    render(<ChatQueueTurnsMeter turnsLeft={1} />)

    expect(screen.getByTestId('chat-queue-turns-note').textContent).toBe('Last turn')
    expect(filled()).toBe(7)
  })

  it('should tell the learner no turns are left when the chat is used up', () => {
    render(<ChatQueueTurnsMeter turnsLeft={0} />)

    expect(screen.getByRole('img', { name: '0 of 8 turns left' })).toBeTruthy()
    expect(screen.getByTestId('chat-queue-turns-note').textContent).toBe('No turns left')
    expect(filled()).toBe(8)
  })
})
