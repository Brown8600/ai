import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createDatabase } from '../db.js'

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const files = (await readdir(migrationDir)).filter(file => file.endsWith('.sql')).sort()
  for (const file of files) {
    const exists = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file])
    if (exists.rowCount) continue
    const sql = await readFile(resolve(migrationDir, file), 'utf8')
    await db.transaction(async client => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file])
    })
    console.info(`Applied migration ${file}`)
  }
} finally {
  await db.close()
}
