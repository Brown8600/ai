import { createDecipheriv, createSign, createVerify, randomBytes, X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { AppConfig } from './config.js'
import { AppError } from './errors.js'

export interface WechatNotificationHeaders {
  timestamp: string
  nonce: string
  signature: string
  serial: string
}

const nonce = () => randomBytes(16).toString('hex')

export function createWechatPay(config: AppConfig) {
  let privateKeyPromise: Promise<string> | null = null
  let platformCertificatePromise: Promise<string> | null = null
  const privateKey = () => privateKeyPromise ||= readFile(config.WX_MCH_PRIVATE_KEY_PATH, 'utf8')
  const platformCertificate = () => platformCertificatePromise ||= readFile(config.WX_PLATFORM_CERT_PATH, 'utf8')

  function assertConfigured() {
    if (!config.WX_APP_ID || !config.WX_MCH_ID || !config.WX_MCH_SERIAL_NO ||
        !config.WX_MCH_PRIVATE_KEY_PATH || config.WX_API_V3_KEY.length !== 32 || !config.WX_PAY_NOTIFY_URL) {
      throw new AppError(503, 'WECHAT_PAY_NOT_CONFIGURED', 'WeChat Pay is not configured')
    }
  }

  async function sign(message: string) {
    const signer = createSign('RSA-SHA256')
    signer.update(message)
    signer.end()
    return signer.sign(await privateKey(), 'base64')
  }

  async function authorization(method: string, path: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const requestNonce = nonce()
    const signature = await sign(`${method}\n${path}\n${timestamp}\n${requestNonce}\n${body}\n`)
    return `WECHATPAY2-SHA256-RSA2048-RSA mchid="${config.WX_MCH_ID}",nonce_str="${requestNonce}",timestamp="${timestamp}",serial_no="${config.WX_MCH_SERIAL_NO}",signature="${signature}"`
  }

  async function createJsapiPayment(input: { description: string; outTradeNo: string; amountCents: number; openid: string }) {
    assertConfigured()
    const path = '/v3/pay/transactions/jsapi'
    const payload = JSON.stringify({
      appid: config.WX_APP_ID,
      mchid: config.WX_MCH_ID,
      description: input.description.slice(0, 127),
      out_trade_no: input.outTradeNo,
      notify_url: config.WX_PAY_NOTIFY_URL,
      amount: { total: input.amountCents, currency: 'CNY' },
      payer: { openid: input.openid }
    })
    const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
      method: 'POST', body: payload,
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: await authorization('POST', path, payload) },
      signal: AbortSignal.timeout(10_000)
    })
    const result = await response.json() as { prepay_id?: string; code?: string; message?: string }
    if (!response.ok || !result.prepay_id) {
      throw new AppError(502, 'WECHAT_PAY_FAILED', result.message || result.code || 'WeChat Pay request failed')
    }
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = nonce()
    const packageValue = `prepay_id=${result.prepay_id}`
    const paySign = await sign(`${config.WX_APP_ID}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`)
    return { timeStamp, nonceStr, package: packageValue, signType: 'RSA' as const, paySign }
  }

  async function verifyNotification(rawBody: string, headers: WechatNotificationHeaders) {
    if (!config.WX_PLATFORM_CERT_PATH) throw new AppError(503, 'WECHAT_CERT_NOT_CONFIGURED', 'WeChat platform certificate is not configured')
    const timestamp = Number(headers.timestamp)
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      throw new AppError(401, 'WECHAT_NOTIFICATION_EXPIRED', 'WeChat Pay notification timestamp is outside the allowed window')
    }
    const certificate = await platformCertificate()
    const expectedSerial = new X509Certificate(certificate).serialNumber.replace(/:/g, '').toUpperCase()
    if (headers.serial.replace(/:/g, '').toUpperCase() !== expectedSerial) {
      throw new AppError(401, 'WECHAT_CERT_SERIAL_MISMATCH', 'WeChat Pay certificate serial does not match')
    }
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`)
    verifier.end()
    if (!verifier.verify(certificate, headers.signature, 'base64')) {
      throw new AppError(401, 'WECHAT_SIGNATURE_INVALID', 'Invalid WeChat Pay notification signature')
    }
  }

  function decryptResource(resource: { ciphertext: string; nonce: string; associated_data?: string }) {
    const encrypted = Buffer.from(resource.ciphertext, 'base64')
    const authTag = encrypted.subarray(encrypted.length - 16)
    const ciphertext = encrypted.subarray(0, encrypted.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(config.WX_API_V3_KEY, 'utf8'), Buffer.from(resource.nonce))
    decipher.setAuthTag(authTag)
    if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data))
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as Record<string, unknown>
  }

  return { createJsapiPayment, verifyNotification, decryptResource }
}

export type WechatPayService = ReturnType<typeof createWechatPay>
