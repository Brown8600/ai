import assert from 'node:assert/strict'
import test from 'node:test'
import { createCipheriv } from 'node:crypto'
import { loadConfig } from '../src/config.js'
import { createWechatPay } from '../src/wechat-pay.js'

test('decrypts a WeChat Pay API v3 AES-GCM resource', () => {
  const key = '12345678901234567890123456789012'
  const nonce = '123456789012'
  const associatedData = 'transaction'
  const payload = { out_trade_no: '202607180001', trade_state: 'SUCCESS', amount: { total: 69900, currency: 'CNY' } }
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce))
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()])

  const config = loadConfig({ DATABASE_URL: 'postgres://test', JWT_SECRET: 'a'.repeat(32), WX_API_V3_KEY: key })
  const service = createWechatPay(config)
  const decrypted = service.decryptResource({
    ciphertext: encrypted.toString('base64'),
    nonce,
    associated_data: associatedData
  })

  assert.deepEqual(decrypted, payload)
})
