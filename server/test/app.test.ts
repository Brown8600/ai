import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from '../src/config.js'
import { buildApp } from '../src/app.js'

test('API app exposes health, catalog, and structured validation errors', async () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://test', JWT_SECRET: 'a'.repeat(32), NODE_ENV: 'test', ALLOW_DEV_LOGIN: 'true' })
  const fakeDb = {
    query: async (sql: string) => {
      if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }], rowCount: 1 }
      return { rows: [{ id: 'category-1', name: '数码' }], rowCount: 1 }
    },
    transaction: async (work: (client: unknown) => Promise<unknown>) => work(fakeDb),
    close: async () => undefined
  } as never
  const app = await buildApp(config, fakeDb)
  try {
    const health = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(health.statusCode, 200)
    assert.equal(JSON.parse(health.body).status, 'ok')

    const categories = await app.inject({ method: 'GET', url: '/api/v1/categories' })
    assert.equal(categories.statusCode, 200)
    assert.equal(JSON.parse(categories.body).data[0].name, '数码')

    const invalidProduct = await app.inject({ method: 'GET', url: '/api/v1/products/not-a-uuid' })
    assert.equal(invalidProduct.statusCode, 400)
    assert.equal(JSON.parse(invalidProduct.body).code, 'VALIDATION_ERROR')
  } finally {
    await app.close()
  }
})
