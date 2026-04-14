import { Pool, QueryResult, QueryResultRow } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Singleton pool — reused across hot-reloads in development
const globalForPg = globalThis as unknown as { pgPool?: Pool }

export const pool = globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values)
}
