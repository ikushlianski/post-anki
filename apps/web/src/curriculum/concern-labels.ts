import { concernSchema, type Concern } from './model'

export const CONCERN_LABEL: Record<Concern, string> = {
  security: 'Security',
  performance: 'Performance',
  observability: 'Observability',
  cost: 'Cost',
  reliability: 'Reliability',
  developer_experience: 'Developer experience',
}

export const CONCERN_OPTIONS: Concern[] = concernSchema.options
