import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import test from 'node:test'
import { hashAdminPassword } from '../src/admin-password.js'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

test('administrator login issues an admin token and protects management routes', async () => {
  const secret = 'a'.repeat(32)
  const passwordHash = await hashAdminPassword('correct horse battery staple')
  const admin = { id: '11111111-1111-4111-8111-111111111111', username: 'admin', password_hash: passwordHash, display_name: '系统管理员', role: 'SUPER_ADMIN' }
  const fakeDb = {
    query: async (sql: string) => {
      if (sql.includes('SELECT id,username,password_hash,display_name,role FROM admin_users WHERE username')) return { rows: [admin], rowCount: 1 }
      if (sql.includes('UPDATE admin_users SET last_login_at')) return { rows: [], rowCount: 1 }
      if (sql.includes('SELECT id,username,display_name,role FROM admin_users')) return { rows: [admin], rowCount: 1 }
      if (sql.includes('user_count')) return { rows: [{ user_count: 3, product_count: 12, low_stock_count: 1, order_count: 5, revenue_cents: '10000', order_counts: { PAID: 1 } }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
    transaction: async (work: (client: unknown) => Promise<unknown>) => work(fakeDb),
    close: async () => undefined
  } as never
  const config = loadConfig({ DATABASE_URL: 'postgres://test', JWT_SECRET: secret, NODE_ENV: 'test' })
  const app = await buildApp(config, fakeDb)
  try {
    const login = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { username: 'admin', password: 'correct horse battery staple' } })
    assert.equal(login.statusCode, 200)
    const loginBody = JSON.parse(login.body).data
    assert.equal(loginBody.admin.role, 'SUPER_ADMIN')

    const dashboard = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { authorization: `Bearer ${loginBody.accessToken}` } })
    assert.equal(dashboard.statusCode, 200)
    assert.equal(JSON.parse(dashboard.body).data.orders, 5)

    const normalUserToken = await new SignJWT({ type: 'access' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-id').sign(new TextEncoder().encode(secret))
    const rejected = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { authorization: `Bearer ${normalUserToken}` } })
    assert.equal(rejected.statusCode, 401)
  } finally {
    await app.close()
  }
})
