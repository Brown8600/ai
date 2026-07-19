import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth.js'
import type { Database } from '../db.js'
import { AppError, conflict, notFound } from '../errors.js'

const uuid = z.string().uuid()
const cartBody = z.object({ skuId: uuid, quantity: z.number().int().min(1).max(99) })
const quantityBody = z.object({ quantity: z.number().int().min(1).max(99) })
const addressBody = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().regex(/^1\d{10}$/, 'Invalid mainland China mobile number'),
  province: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(40),
  detail: z.string().trim().min(3).max(160),
  isDefault: z.boolean().default(false)
})
const quoteBody = z.object({
  items: z.array(z.object({ skuId: uuid, quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  addressId: uuid
}).superRefine((value, context) => {
  const ids = new Set<string>()
  value.items.forEach((item, index) => {
    if (ids.has(item.skuId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'skuId'], message: 'Duplicate SKU' })
    ids.add(item.skuId)
  })
})
const orderBody = z.object({ quoteToken: uuid, remark: z.string().trim().max(200).default('') })

interface SkuRow {
  sku_id: string
  product_id: string
  specification: string
  price_cents: number
  original_price_cents: number | null
  stock: number
  product_name: string
  subtitle: string
  image_url: string
  badge: string | null
  sales: number
  category_id: string
  category_name: string
}

interface QuoteLine {
  skuId: string
  productId: string
  productName: string
  specification: string
  image: string
  priceCents: number
  quantity: number
}

interface QuotePayload {
  lines: QuoteLine[]
  address: Record<string, unknown>
  subtotalCents: number
  discountCents: number
  freightCents: number
  payableCents: number
}

const skuSelect = `
  SELECT s.id AS sku_id, s.product_id, s.specification, s.price_cents,
         s.original_price_cents, s.stock, p.name AS product_name, p.subtitle,
         p.image_url, p.badge, p.sales, c.id AS category_id, c.name AS category_name
  FROM product_skus s
  JOIN products p ON p.id = s.product_id AND p.enabled = true
  JOIN categories c ON c.id = p.category_id AND c.enabled = true
`

const orderNo = () => {
  const now = new Date()
  const timestamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `${timestamp}${randomBytes(4).toString('hex').toUpperCase()}`
}

const hashRequest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function readOrder(db: Database, userId: string, id: string) {
  const order = await db.query<{
    id: string; order_no: string; status: string; subtotal_cents: number; discount_cents: number;
    freight_cents: number; payable_cents: number; remark: string; address_snapshot: Record<string, unknown>;
    payment_deadline: Date; created_at: Date; items: Array<Record<string, unknown>>
  }>(
    `SELECT o.id, o.order_no, o.status, o.subtotal_cents, o.discount_cents, o.freight_cents,
            o.payable_cents, o.remark, o.address_snapshot, o.payment_deadline, o.created_at,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', i.id, 'productId', i.product_id, 'skuId', i.sku_id,
              'productName', i.product_name, 'specification', i.specification,
              'image', i.image_url, 'unitPriceCents', i.unit_price_cents, 'quantity', i.quantity
            ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
     WHERE o.id = $1 AND o.user_id = $2 GROUP BY o.id`, [id, userId]
  )
  const row = order.rows[0]
  if (!row) throw notFound('Order not found')
  return {
    id: row.id, orderNo: row.order_no, status: row.status,
    subtotalCents: row.subtotal_cents, discountCents: row.discount_cents,
    freightCents: row.freight_cents, payableCents: row.payable_cents,
    remark: row.remark, address: row.address_snapshot, items: row.items,
    paymentDeadline: row.payment_deadline.toISOString(), createdAt: row.created_at.toISOString()
  }
}

export async function commerceRoutes(app: FastifyInstance, options: { db: Database; auth: AuthService }) {
  const { db, auth } = options
  app.addHook('preHandler', auth.authenticate)

  app.get('/cart', async request => {
    const result = await db.query<SkuRow & { cart_item_id: string; quantity: number }>(
      `SELECT ci.id AS cart_item_id, ci.quantity, catalog.* FROM cart_items ci
       JOIN (${skuSelect}) catalog ON catalog.sku_id = ci.sku_id
       WHERE ci.user_id = $1 ORDER BY ci.created_at DESC`, [request.userId]
    )
    return { data: result.rows.map(row => ({
      id: row.cart_item_id, skuId: row.sku_id, quantity: row.quantity,
      specification: row.specification, priceCents: row.price_cents, stock: row.stock,
      product: { id: row.product_id, categoryId: row.category_id, category: row.category_name,
        name: row.product_name, subtitle: row.subtitle, image: row.image_url,
        badge: row.badge, sales: row.sales }
    })) }
  })

  app.post('/cart/items', async request => {
    const body = cartBody.parse(request.body)
    await db.transaction(async client => {
      const sku = await client.query<{ stock: number }>(
        'SELECT stock FROM product_skus WHERE id=$1 AND enabled=true FOR UPDATE', [body.skuId]
      )
      if (!sku.rows[0]) throw notFound('SKU not found')
      const current = await client.query<{ quantity: number }>(
        'SELECT quantity FROM cart_items WHERE user_id=$1 AND sku_id=$2 FOR UPDATE', [request.userId, body.skuId]
      )
      const nextQuantity = Math.min(99, (current.rows[0]?.quantity || 0) + body.quantity)
      if (nextQuantity > sku.rows[0].stock) throw conflict('INSUFFICIENT_STOCK', 'Insufficient stock')
      await client.query(
        `INSERT INTO cart_items(user_id, sku_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT(user_id, sku_id) DO UPDATE SET quantity=$3, updated_at=now()`,
        [request.userId, body.skuId, nextQuantity]
      )
    })
    return { data: { success: true } }
  })

  app.patch('/cart/items/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    const { quantity } = quantityBody.parse(request.body)
    const result = await db.query(
      `UPDATE cart_items ci SET quantity = $1, updated_at = now()
       FROM product_skus s WHERE ci.id = $2 AND ci.user_id = $3 AND s.id = ci.sku_id AND s.stock >= $1
       RETURNING ci.id`, [quantity, id, request.userId]
    )
    if (!result.rowCount) throw conflict('CART_UPDATE_FAILED', 'Cart item not found or stock is insufficient')
    return { data: { success: true } }
  })

  app.delete('/cart/items/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    await db.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [id, request.userId])
    return { data: { success: true } }
  })

  app.get('/addresses', async request => {
    const result = await db.query(
      `SELECT id, name, phone, province, city, district, detail, is_default AS "isDefault"
       FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`, [request.userId]
    )
    return { data: result.rows }
  })

  app.post('/addresses', async request => {
    const body = addressBody.parse(request.body)
    const address = await db.transaction(async client => {
      if (body.isDefault) await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [request.userId])
      const result = await client.query(
        `INSERT INTO addresses(user_id, name, phone, province, city, district, detail, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [request.userId, body.name, body.phone, body.province, body.city, body.district, body.detail, body.isDefault]
      )
      return result.rows[0]
    })
    return { data: address }
  })

  app.patch('/addresses/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    const body = addressBody.parse(request.body)
    await db.transaction(async client => {
      if (body.isDefault) await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [request.userId])
      const result = await client.query(
        `UPDATE addresses SET name=$1,phone=$2,province=$3,city=$4,district=$5,detail=$6,is_default=$7,updated_at=now()
         WHERE id=$8 AND user_id=$9 RETURNING id`,
        [body.name, body.phone, body.province, body.city, body.district, body.detail, body.isDefault, id, request.userId]
      )
      if (!result.rowCount) throw notFound('Address not found')
    })
    return { data: { success: true } }
  })

  app.delete('/addresses/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    const result = await db.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id', [id, request.userId])
    if (!result.rowCount) throw notFound('Address not found')
    return { data: { success: true } }
  })

  app.put('/addresses/:id/default', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    await db.transaction(async client => {
      const owned = await client.query('SELECT 1 FROM addresses WHERE id = $1 AND user_id = $2', [id, request.userId])
      if (!owned.rowCount) throw notFound('Address not found')
      await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [request.userId])
      await client.query('UPDATE addresses SET is_default = true, updated_at = now() WHERE id = $1', [id])
    })
    return { data: { success: true } }
  })

  app.post('/checkout/quote', async request => {
    const body = quoteBody.parse(request.body)
    const addressResult = await db.query<Record<string, unknown> & { id: string }>(
      `SELECT id,name,phone,province,city,district,detail,is_default AS "isDefault" FROM addresses WHERE id=$1 AND user_id=$2`,
      [body.addressId, request.userId]
    )
    if (!addressResult.rows[0]) throw notFound('Address not found')
    const requested = new Map(body.items.map(item => [item.skuId, item.quantity]))
    const skuResult = await db.query<SkuRow>(
      `${skuSelect} WHERE s.id = ANY($1::uuid[]) AND s.enabled = true`, [[...requested.keys()]]
    )
    const unavailableItems: Array<{ skuId: string; reason: string }> = []
    const lines: QuoteLine[] = []
    for (const [skuId, quantity] of requested) {
      const sku = skuResult.rows.find(item => item.sku_id === skuId)
      if (!sku) unavailableItems.push({ skuId, reason: 'SKU_NOT_FOUND' })
      else if (sku.stock < quantity) unavailableItems.push({ skuId, reason: 'INSUFFICIENT_STOCK' })
      else lines.push({ skuId, productId: sku.product_id, productName: sku.product_name,
        specification: sku.specification, image: sku.image_url, priceCents: sku.price_cents, quantity })
    }
    if (unavailableItems.length) {
      throw new AppError(409, 'QUOTE_UNAVAILABLE', 'Some items are unavailable', { unavailableItems })
    }
    const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
    const discountCents = 0
    const freightCents = subtotalCents >= 9900 ? 0 : 1000
    const payload: QuotePayload = {
      lines, address: addressResult.rows[0], subtotalCents, discountCents, freightCents,
      payableCents: subtotalCents - discountCents + freightCents
    }
    const expiresAt = new Date(Date.now() + 10 * 60_000)
    const result = await db.query<{ id: string }>(
      `INSERT INTO checkout_quotes(user_id,address_id,payload,expires_at) VALUES($1,$2,$3,$4) RETURNING id`,
      [request.userId, body.addressId, JSON.stringify(payload), expiresAt]
    )
    return { data: { quoteToken: result.rows[0]!.id, expiresAt: expiresAt.toISOString(), ...payload, unavailableItems: [] } }
  })

  app.post('/orders', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const body = orderBody.parse(request.body)
    const idempotencyKey = z.string().min(8).max(128).parse(request.headers['idempotency-key'])
    const requestHash = hashRequest(body)
    const result = await db.transaction(async client => {
      // 同一用户和幂等键在事务级加锁，避免两个并发请求同时通过“不存在”检查。
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${request.userId}:${idempotencyKey}`])
      const idempotency = await client.query<{ request_hash: string; order_id: string | null }>(
        'SELECT request_hash,order_id FROM idempotency_keys WHERE user_id=$1 AND key=$2 FOR UPDATE',
        [request.userId, idempotencyKey]
      )
      if (idempotency.rows[0]) {
        if (idempotency.rows[0].request_hash !== requestHash) throw conflict('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was used for another request')
        if (idempotency.rows[0].order_id) return { orderId: idempotency.rows[0].order_id, replayed: true }
        throw conflict('ORDER_IN_PROGRESS', 'The same order request is still processing')
      }
      await client.query('INSERT INTO idempotency_keys(user_id,key,request_hash) VALUES($1,$2,$3)', [request.userId, idempotencyKey, requestHash])
      const quoteResult = await client.query<{ payload: QuotePayload; expires_at: Date; consumed_at: Date | null }>(
        `SELECT payload,expires_at,consumed_at FROM checkout_quotes
         WHERE id=$1 AND user_id=$2 FOR UPDATE`, [body.quoteToken, request.userId]
      )
      const quote = quoteResult.rows[0]
      if (!quote || quote.consumed_at || quote.expires_at.getTime() <= Date.now()) throw conflict('QUOTE_EXPIRED', 'Checkout quote is invalid or expired')
      for (const line of quote.payload.lines) {
        const locked = await client.query<{ price_cents: number; stock: number }>(
          'SELECT price_cents,stock FROM product_skus WHERE id=$1 AND enabled=true FOR UPDATE', [line.skuId]
        )
        if (!locked.rows[0] || locked.rows[0].price_cents !== line.priceCents || locked.rows[0].stock < line.quantity) {
          throw conflict('QUOTE_CHANGED', 'Price or stock changed; request a new quote')
        }
        await client.query('UPDATE product_skus SET stock=stock-$1 WHERE id=$2', [line.quantity, line.skuId])
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO orders(order_no,user_id,address_snapshot,subtotal_cents,discount_cents,freight_cents,payable_cents,remark,payment_deadline)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '30 minutes') RETURNING id`,
        [orderNo(), request.userId, JSON.stringify(quote.payload.address), quote.payload.subtotalCents,
          quote.payload.discountCents, quote.payload.freightCents, quote.payload.payableCents, body.remark]
      )
      const orderId = created.rows[0]!.id
      for (const line of quote.payload.lines) {
        await client.query(
          `INSERT INTO order_items(order_id,product_id,sku_id,product_name,specification,image_url,unit_price_cents,quantity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orderId,line.productId,line.skuId,line.productName,line.specification,line.image,line.priceCents,line.quantity]
        )
        await client.query('DELETE FROM cart_items WHERE user_id=$1 AND sku_id=$2', [request.userId, line.skuId])
      }
      await client.query('UPDATE checkout_quotes SET consumed_at=now() WHERE id=$1', [body.quoteToken])
      await client.query('UPDATE idempotency_keys SET order_id=$1 WHERE user_id=$2 AND key=$3', [orderId, request.userId, idempotencyKey])
      return { orderId, replayed: false }
    })
    return { data: { ...(await readOrder(db, request.userId!, result.orderId)), replayed: result.replayed } }
  })

  app.get('/orders', async request => {
    const query = z.object({ status: z.enum(['PENDING_PAYMENT','PAID','SHIPPED','COMPLETED','CANCELLED']).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(request.query)
    const values: unknown[] = [request.userId]
    const statusSql = query.status ? (values.push(query.status), `AND status=$${values.length}`) : ''
    values.push(query.limit)
    const result = await db.query<{ id: string }>(
      `SELECT id FROM orders WHERE user_id=$1 ${statusSql} ORDER BY created_at DESC LIMIT $${values.length}`, values
    )
    return { data: await Promise.all(result.rows.map(row => readOrder(db, request.userId!, row.id))) }
  })

  app.get('/orders/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    return { data: await readOrder(db, request.userId!, id) }
  })

  app.post('/orders/:id/cancel', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    await db.transaction(async client => {
      const order = await client.query<{ status: string }>('SELECT status FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [id,request.userId])
      if (!order.rows[0]) throw notFound('Order not found')
      if (order.rows[0].status === 'CANCELLED') return
      if (order.rows[0].status !== 'PENDING_PAYMENT') throw conflict('ORDER_CANNOT_CANCEL', 'Only pending payment orders can be cancelled')
      await client.query(`UPDATE product_skus s SET stock=s.stock+i.quantity FROM order_items i WHERE i.order_id=$1 AND i.sku_id=s.id`, [id])
      await client.query(`UPDATE orders SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE id=$1`, [id])
    })
    return { data: await readOrder(db, request.userId!, id) }
  })

  app.post('/orders/:id/confirm-receipt', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params)
    const result = await db.query(
      `UPDATE orders SET status='COMPLETED',completed_at=now(),updated_at=now()
       WHERE id=$1 AND user_id=$2 AND status='SHIPPED' RETURNING id`, [id,request.userId]
    )
    if (!result.rowCount) throw conflict('ORDER_CANNOT_CONFIRM', 'Only shipped orders can be confirmed')
    return { data: await readOrder(db, request.userId!, id) }
  })
}
