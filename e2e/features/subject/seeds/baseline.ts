import type { Pool } from 'pg'

export interface SeedResult {
  applied: string[]
}

export async function applyBaselineSeed(_pool: Pool): Promise<SeedResult> {
  return { applied: [] }
}
