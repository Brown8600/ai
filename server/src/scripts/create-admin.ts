import { loadConfig } from '../config.js'
import { createDatabase } from '../db.js'
import { hashAdminPassword } from '../admin-password.js'

const config = loadConfig()
if (!config.ADMIN_SEED_USERNAME || !config.ADMIN_SEED_PASSWORD) {
  throw new Error('Set ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD before creating an administrator')
}
const username = config.ADMIN_SEED_USERNAME.trim().toLowerCase()
if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
  throw new Error('ADMIN_SEED_USERNAME must be 3-50 lowercase letters, digits, dots, underscores or hyphens')
}
const passwordHash = await hashAdminPassword(config.ADMIN_SEED_PASSWORD)
const db = createDatabase(config.DATABASE_URL)
try {
  const result = await db.query<{ id: string }>(
    `INSERT INTO admin_users(username,password_hash,display_name,role)
     VALUES($1,$2,$3,'SUPER_ADMIN')
     ON CONFLICT(username) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()
     RETURNING id`, [username, passwordHash, config.ADMIN_SEED_DISPLAY_NAME]
  )
  console.info(`Administrator ready: ${username} (${result.rows[0]?.id || 'existing'})`)
} finally {
  await db.close()
}
