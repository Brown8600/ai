import assert from 'node:assert/strict'
import test from 'node:test'
import { hashAdminPassword, verifyAdminPassword } from '../src/admin-password.js'

test('admin password hashes verify and reject wrong passwords', async () => {
  const hash = await hashAdminPassword('correct horse battery staple')
  assert.notEqual(hash, 'correct horse battery staple')
  assert.equal(await verifyAdminPassword('correct horse battery staple', hash), true)
  assert.equal(await verifyAdminPassword('wrong password', hash), false)
  assert.equal(await verifyAdminPassword('correct horse battery staple', 'not-a-hash'), false)
})
