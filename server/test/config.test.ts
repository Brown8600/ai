import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgres://test', JWT_SECRET: 'a'.repeat(32) }

test('development config enables explicit dev login', () => {
  const config = loadConfig({ ...base, NODE_ENV: 'development', ALLOW_DEV_LOGIN: 'true' })
  assert.equal(config.ALLOW_DEV_LOGIN, true)
})

test('production rejects development login bypass', () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'true' }), /must be false/)
})

test('JWT secret must have at least 32 characters', () => {
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'short' }), /JWT_SECRET/)
})

test('administrator seed credentials must be paired and use a strong password', () => {
  assert.throws(() => loadConfig({ ...base, ADMIN_SEED_USERNAME: 'admin' }), /configured together/)
  assert.throws(() => loadConfig({ ...base, ADMIN_SEED_USERNAME: 'admin', ADMIN_SEED_PASSWORD: 'short' }), /at least 12/)
  const config = loadConfig({ ...base, ADMIN_SEED_USERNAME: 'admin', ADMIN_SEED_PASSWORD: 'correct horse battery staple' })
  assert.equal(config.ADMIN_SEED_USERNAME, 'admin')
})
