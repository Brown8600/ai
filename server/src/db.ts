import pg, { type PoolClient, type QueryResultRow } from 'pg'

const { Pool } = pg

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000 })

  return {
    pool,
    query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
      return pool.query<T>(text, values)
    },
    async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await work(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    close() { return pool.end() }
  }
}

export type Database = ReturnType<typeof createDatabase>
