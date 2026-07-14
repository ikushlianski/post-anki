import { Pool } from 'pg'

import { ActionFailure } from './action-failure'
import { assertTargetAllowed } from './assert-target-allowed'

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) {
    return pool
  }

  const connectionString = process.env.E2E_DATABASE_URL
  const check = assertTargetAllowed(connectionString)

  if (!check.allowed) {
    throw ActionFailure.fromMessage(check.refusalMessage ?? 'forbidden target', 'db')
  }

  pool = new Pool({ connectionString })

  return pool
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw ActionFailure.fromMessage(`unsafe identifier "${name}"`, 'db')
  }
}

function buildWhere(where: Record<string, unknown>): {
  clause: string
  values: unknown[]
} {
  const keys = Object.keys(where)
  keys.forEach(assertIdentifier)

  const clause = keys.map((key, i) => `"${key}" = $${i + 1}`).join(' AND ')
  const values = keys.map((key) => where[key])

  return { clause: clause === '' ? 'true' : clause, values }
}

export async function countWhere(
  table: string,
  where: Record<string, unknown> = {},
): Promise<number> {
  assertIdentifier(table)
  const { clause, values } = buildWhere(where)
  const result = await getPool().query(
    `SELECT count(*)::int AS n FROM "${table}" WHERE ${clause}`,
    values,
  )

  return result.rows[0]?.n ?? 0
}

export async function rowExists(
  table: string,
  where: Record<string, unknown>,
): Promise<boolean> {
  return (await countWhere(table, where)) > 0
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
