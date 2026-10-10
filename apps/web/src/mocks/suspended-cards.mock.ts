import type { SuspendedCard } from '@post-anki/shared'

export const suspendedByHandCard: SuspendedCard = {
  knowledgeBitId: 'bit-handshake',
  itemText: 'TCP opens a connection with a three-way handshake.',
  question: 'Why does TCP use a three-way handshake?',
  answer: 'To agree on starting sequence numbers before any data is sent.',
  subjectName: 'Networking',
  reason: 'suspended',
  lapses: 1,
  suspended: true,
  buriedUntil: null,
  since: '2026-10-05T08:00:00.000Z',
}

export const leechCard: SuspendedCard = {
  knowledgeBitId: 'bit-spacing',
  itemText: 'Spaced repetition spaces out reviews as memory strengthens.',
  question: 'What does the review interval do after each successful recall?',
  answer: 'It grows, so the card comes back less often as the memory holds.',
  subjectName: 'Learning science',
  reason: 'leech',
  lapses: 9,
  suspended: true,
  buriedUntil: null,
  since: '2026-10-07T18:30:00.000Z',
}

export const buriedCard: SuspendedCard = {
  knowledgeBitId: 'bit-leitner',
  itemText: 'The Leitner system moves cards between numbered boxes.',
  question: 'What happens to a card in the Leitner system after a correct answer?',
  answer: 'It moves up one box, so it is reviewed less often.',
  subjectName: null,
  reason: 'buried',
  lapses: 0,
  suspended: false,
  buriedUntil: '2026-10-12T00:00:00.000Z',
  since: null,
}

export const suspendedCards: SuspendedCard[] = [suspendedByHandCard, leechCard, buriedCard]
