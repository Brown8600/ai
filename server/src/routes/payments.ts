import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import type { Database } from '../db.js'
import type { AuthService } from '../auth.js'
import type { WechatPayService } from '../wechat-pay.js'
import { AppError, conflict, notFound } from '../errors.js'

declare module 'fastify' {
  interface FastifyRequest { rawBody?: string }
}

const notificationSchema = z.object({
  id: z.string().min(1),
  event_type: z.string(),
  resource: z.object({ ciphertext: z.string(), nonce: z.string(), associated_data: z.string().optional() })
})

export async function paymentRoutes(app: FastifyInstance, options: { config: AppConfig; db: Database; auth: AuthService; pay: WechatPayService }) {
  const { config, db, auth, pay } = options

  app.post('/orders/:id/payments/wechat', { preHandler: auth.authenticate }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const result = await db.query<{ order_no: string; payable_cents: number; status: string; openid: string; product_name: string }>(
      `SELECT o.order_no,o.payable_cents,o.status,u.openid,MIN(i.product_name) AS product_name
       FROM orders o JOIN users u ON u.id=o.user_id JOIN order_items i ON i.order_id=o.id
       WHERE o.id=$1 AND o.user_id=$2 GROUP BY o.id,u.id`, [id, request.userId]
    )
    const order = result.rows[0]
    if (!order) throw notFound('Order not found')
    if (order.status !== 'PENDING_PAYMENT') throw conflict('ORDER_NOT_PAYABLE', 'Order is not awaiting payment')
    const outTradeNo = order.order_no
    await db.query(
      `INSERT INTO payments(order_id,out_trade_no,amount_cents) VALUES($1,$2,$3)
       ON CONFLICT(out_trade_no) DO NOTHING`, [id,outTradeNo,order.payable_cents]
    )
    return { data: await pay.createJsapiPayment({ description: order.product_name, outTradeNo, amountCents: order.payable_cents, openid: order.openid }) }
  })

  app.post('/payments/wechat/notify', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async request => {
    const rawBody = request.rawBody
    if (!rawBody) throw new AppError(400, 'RAW_BODY_MISSING', 'Raw notification body is required')
    const timestamp = String(request.headers['wechatpay-timestamp'] || '')
    const requestNonce = String(request.headers['wechatpay-nonce'] || '')
    const signature = String(request.headers['wechatpay-signature'] || '')
    const serial = String(request.headers['wechatpay-serial'] || '')
    if (!timestamp || !requestNonce || !signature || !serial) throw new AppError(400, 'WECHAT_HEADERS_MISSING', 'WeChat Pay headers are missing')
    await pay.verifyNotification(rawBody, { timestamp, nonce: requestNonce, signature, serial })
    const event = notificationSchema.parse(request.body)
    const transaction = pay.decryptResource(event.resource) as {
      appid?: string; mchid?: string; out_trade_no?: string; transaction_id?: string;
      trade_state?: string; success_time?: string; amount?: { total?: number; currency?: string }
    }
    if (transaction.appid !== config.WX_APP_ID || transaction.mchid !== config.WX_MCH_ID ||
        !transaction.out_trade_no || !transaction.transaction_id || transaction.amount?.currency !== 'CNY') {
      throw new AppError(400, 'WECHAT_NOTIFY_MISMATCH', 'Payment notification merchant data does not match')
    }
    await db.transaction(async client => {
      const inserted = await client.query(
        'INSERT INTO payment_events(event_id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
        [event.id, rawBody]
      )
      if (!inserted.rowCount) return
      const paymentResult = await client.query<{ id: string; order_id: string; amount_cents: number; status: string }>(
        'SELECT id,order_id,amount_cents,status FROM payments WHERE out_trade_no=$1 FOR UPDATE', [transaction.out_trade_no]
      )
      const payment = paymentResult.rows[0]
      if (!payment) throw notFound('Payment not found')
      if (transaction.amount?.total !== payment.amount_cents) throw new AppError(400, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match order')
      if (transaction.trade_state === 'SUCCESS' && payment.status !== 'SUCCESS') {
        await client.query(
          `UPDATE payments SET status='SUCCESS',transaction_id=$1,raw_notify=$2,updated_at=now() WHERE id=$3`,
          [transaction.transaction_id, rawBody, payment.id]
        )
        await client.query(
          `UPDATE orders SET status='PAID',paid_at=COALESCE($1::timestamptz,now()),updated_at=now()
           WHERE id=$2 AND status='PENDING_PAYMENT'`, [transaction.success_time || null,payment.order_id]
        )
      }
    })
    return { code: 'SUCCESS', message: '成功' }
  })
}
