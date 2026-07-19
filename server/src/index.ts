import { loadConfig } from './config.js'
import { createDatabase } from './db.js'
import { buildApp } from './app.js'

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)
const app = await buildApp(config, db)

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  await db.close()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  app.log.error(error)
  await db.close()
  process.exit(1)
}
