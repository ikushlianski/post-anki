// Storybook stand-in for curriculum/board.collection.ts. The real collections sync from
// /api/electric-shape, which the Storybook server does not serve, so they are replaced by
// local-only collections that stay empty. The pure row mappers come from the real module.

import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'

export * from '../../src/curriculum/board.collection'

interface StoryRow {
  id: string
}

export const subjectsCollection = createCollection(
  localOnlyCollectionOptions<StoryRow>({ id: 'storybook-board-subjects', getKey: (row) => row.id }),
)

export const curriculaCollection = createCollection(
  localOnlyCollectionOptions<StoryRow>({ id: 'storybook-board-curricula', getKey: (row) => row.id }),
)

export const curriculumSourcesCollection = createCollection(
  localOnlyCollectionOptions<StoryRow>({
    id: 'storybook-board-curriculum-sources',
    getKey: (row) => row.id,
  }),
)
