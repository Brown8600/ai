import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashAdminPassword, verifyAdminPassword } from '../admin-password.js'
import type { AppConfig } from '../config.js'
import type { Database } from '../db.js'
import { AppError, conflict, notFound } from '../errors.js'
import type { AdminAuthService, AdminRole } from '../admin-auth.js'

const uuid = z.string().uuid()
const role = z.enum(['SUPER_ADMIN', 'OPERATOR'])
const status = z.enum(['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED'])
const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) })
const adminLoginBody = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/),
  password: z.string().min(12).max(128)
})
const categoryBody = z.object({ name: z.string().trim().min(1).max(40), sortOrder: z.number().int().min(-10_000).max(10_000).default(0), enabled: z.boolean().default(true) })
const categoryPatch = categoryBody.partial().refine(value => Object.keys(value).length > 0, 'At least one field is required')
const skuBody = z.object({
  specification: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0),
  originalPriceCents: z.number().int().min(0).nullable().default(null),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  enabled: z.boolean().default(true)
}).superRefine((value, context) => {
  if (value.originalPriceCents !== null && value.originalPriceCents < value.priceCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['originalPriceCents'], message: 'Original price must be greater than or equal to price' })
  }
})
const productBody = z.object({
  categoryId: uuid,
  name: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).default(''),
  description: z.string().trim().max(4_000).default(''),
  image: z.string().url().max(2_000),
  badge: z.string().trim().max(40).nullable().default(null),
  sales: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
  skus: z.array(skuBody).min(1).max(50)
})
const productPatch = productBody.omit({ skus: true }).partial().refine(value => Object.keys(value).length > 0, 'At least one field is required')
const skuPatch = z.object({
  specification: z.string().trim().min(1).max(80).optional(),
  priceCents: z.number().int().min(0).optional(),
  originalPriceCents: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).max(10_000_000).optional(),
  enabled: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const createAdminBody = z.object({
  username: adminLoginBody.shape.username,
  password: adminLoginBody.shape.password,
  displayName: z.string().trim().min(1).max(80),
  role: role.default('OPERATOR')
})
const patchAdminBody = z.object({
  password: z.string().min(12).max(128).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  role: role.optional(),
  enabled: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const dummyPasswordHash = hashAdminPassword('invalid administrator password')

function pgCode(error: unknown) {
  return (error as { code?: string }).code
}

async function audit(db: Database, request: FastifyRequest, action: string, resourceType: string, resourceId: string | null, details: Record<string, unknown> = {}) {
  await db.query(
    `INSERT INTO admin_audit_logs(admin_user_id,action,resource_type,resource_id,details,ip_address)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [request.admin?.id || null, action, resourceType, resourceId, JSON.stringify(details), request.ip]
  )
}

interface AdminProductRow {
  id: string; category_id: string; category_name: string; name: string; subtitle: string; description: string;
  image_url: string; badge: string | null; sales: number; enabled: boolean; created_at: Date; updated_at: Date;
  skus: Array<{ id: string; specification: string; priceCents: number; originalPriceCents: number | null; stock: number; enabled: boolean }>
}

const adminProductSelect = `
  SELECT p.id,p.category_id,c.name AS category_name,p.name,p.subtitle,p.description,p.image_url,p.badge,p.sales,p.enabled,p.created_at,p.updated_at,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id',s.id,'specification',s.specification,'priceCents',s.price_cents,
           'originalPriceCents',s.original_price_cents,'stock',s.stock,'enabled',s.enabled
         ) ORDER BY s.price_cents) FILTER (WHERE s.id IS NOT NULL),'[]') AS skus
  FROM products p JOIN categories c ON c.id=p.category_id
  LEFT JOIN product_skus s ON s.product_id=p.id
`

function mapAdminProduct(row: AdminProductRow) {
  return {
    id: row.id, categoryId: row.category_id, category: row.category_name, name: row.name,
    subtitle: row.subtitle, description: row.description, image: row.image_url, badge: row.badge,
    sales: row.sales, enabled: row.enabled, skus: row.skus,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  }
}

async function readAdminOrder(db: Database, id: string) {
  const result = await db.query<{
    id: string; order_no: string; user_id: string; nickname: string | null; status: string;
    subtotal_cents: number; discount_cents: number; freight_cents: number; payable_cents: number;
    remark: string; address_snapshot: Record<string, unknown>; payment_deadline: Date; created_at: Date;
    paid_at: Date | null; shipped_at: Date | null; shipping_carrier: string | null; tracking_no: string | null;
    items: Array<Record<string, unknown>>
  }>(
    `SELECT o.id,o.order_no,o.user_id,u.nickname,o.status,o.subtotal_cents,o.discount_cents,o.freight_cents,o.payable_cents,o.remark,
            o.address_snapshot,o.payment_deadline,o.created_at,o.paid_at,o.shipped_at,o.shipping_carrier,o.tracking_no,
            COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'skuId',i.sku_id,'productName',i.product_name,
              'specification',i.specification,'image',i.image_url,'unitPriceCents',i.unit_price_cents,'quantity',i.quantity)
              ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),'[]') AS items
     FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_items i ON i.order_id=o.id
     WHERE o.id=$1 GROUP BY o.id,u.id`, [id]
  )
  const row = result.rows[0]
  if (!row) throw notFound('Order not found')
  return {
    id: row.id, orderNo: row.order_no, userId: row.user_id, nickname: row.nickname,
    status: row.status, subtotalCents: row.subtotal_cents, discountCents: row.discount_cents,
    freightCents: row.freight_cents, payableCents: row.payable_cents, remark: row.remark,
    address: row.address_snapshot, paymentDeadline: row.payment_deadline.toISOString(),
    createdAt: row.created_at.toISOString(), paidAt: row.paid_at?.toISOString() || null,
    shippedAt: row.shipped_at?.toISOString() || null, shippingCarrier: row.shipping_carrier,
    trackingNo: row.tracking_no, items: row.items
  }
}

export async function adminRoutes(app: FastifyInstance, options: { config: AppConfig; db: Database; adminAuth: AdminAuthService }) {
  const { config, db, adminAuth } = options

  app.post('/admin/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const body = adminLoginBody.parse(request.body)
    const result = await db.query<{ id: string; username: string; password_hash: string; display_name: string; role: AdminRole }>(
      'SELECT id,username,password_hash,display_name,role FROM admin_users WHERE username=$1 AND enabled=true', [body.username]
    )
    const row = result.rows[0]
    const passwordValid = await verifyAdminPassword(body.password, row?.password_hash || await dummyPasswordHash)
    if (!row || !passwordValid) {
      throw new AppError(401, 'ADMIN_LOGIN_FAILED', 'Invalid administrator username or password')
    }
    await db.query('UPDATE admin_users SET last_login_at=now(),updated_at=now() WHERE id=$1', [row.id])
    const admin = { id: row.id, username: row.username, displayName: row.display_name, role: row.role }
    request.admin = admin
    await audit(db, request, 'LOGIN', 'admin_user', row.id)
    return { data: { accessToken: await adminAuth.issueAccessToken(admin), expiresIn: config.ADMIN_ACCESS_TOKEN_TTL_SECONDS, admin } }
  })

  await app.register(async protectedAdmin => {
    protectedAdmin.addHook('preHandler', adminAuth.authenticate)

    protectedAdmin.get('/auth/me', async request => ({ data: request.admin }))

    protectedAdmin.get('/dashboard', async () => {
      const result = await db.query<{
        user_count: number; product_count: number; low_stock_count: number; order_count: number;
        revenue_cents: string; order_counts: Record<string, number> | null
      }>(
        `SELECT
          (SELECT count(*)::int FROM users) AS user_count,
          (SELECT count(*)::int FROM products WHERE enabled=true) AS product_count,
          (SELECT count(*)::int FROM product_skus WHERE enabled=true AND stock <= 10) AS low_stock_count,
          (SELECT count(*)::int FROM orders) AS order_count,
          (SELECT COALESCE(sum(payable_cents),0)::text FROM orders WHERE status IN ('PAID','SHIPPED','COMPLETED')) AS revenue_cents,
          (SELECT jsonb_object_agg(status,total) FROM (SELECT status,count(*)::int AS total FROM orders GROUP BY status) summary) AS order_counts`
      )
      const row = result.rows[0]!
      return { data: {
        users: row.user_count, enabledProducts: row.product_count, lowStockSkus: row.low_stock_count,
        orders: row.order_count, revenueCents: Number(row.revenue_cents || 0), orderCounts: row.order_counts || {}
      } }
    })

    protectedAdmin.get('/categories', async () => {
      const result = await db.query<{ id: string; name: string; sort_order: number; enabled: boolean }>(
        'SELECT id,name,sort_order,enabled FROM categories ORDER BY sort_order,name'
      )
      return { data: result.rows.map(row => ({ id: row.id, name: row.name, sortOrder: row.sort_order, enabled: row.enabled })) }
    })

    protectedAdmin.post('/categories', async request => {
      const body = categoryBody.parse(request.body)
      try {
        const result = await db.query<{ id: string }>(
          'INSERT INTO categories(name,sort_order,enabled) VALUES($1,$2,$3) RETURNING id', [body.name, body.sortOrder, body.enabled]
        )
        await audit(db, request, 'CREATE', 'category', result.rows[0]!.id, { name: body.name })
        return { data: { id: result.rows[0]!.id, ...body } }
      } catch (error) {
        if (pgCode(error) === '23505') throw conflict('CATEGORY_EXISTS', 'Category name already exists')
        throw error
      }
    })

    protectedAdmin.patch('/categories/:id', async request => {
      const { id } = z.object({ id: uuid }).parse(request.params)
      const body = categoryPatch.parse(request.body)
      const fields: string[] = []
      const values: unknown[] = []
      for (const [key, column] of [['name', 'name'], ['sortOrder', 'sort_order'], ['enabled', 'enabled']] as const) {
        if (body[key] !== undefined) { values.push(body[key]); fields.push(`${column}=$${values.length}`) }
      }
      values.push(id)
      try {
        const result = await db.query<{ id: string }>(`UPDATE categories SET ${fields.join(',')} WHERE id=$${values.length} RETURNING id`, values)
        if (!result.rows[0]) throw notFound('Category not found')
        await audit(db, request, 'UPDATE', 'category', id, body)
        return { data: { success: true } }
      } catch (error) {
        if (pgCode(error) === '23505') throw conflict('CATEGORY_EXISTS', 'Category name already exists')
        throw error
      }
    })

    protectedAdmin.get('/products', async request => {
      const query = pageQuery.extend({ keyword: z.string().trim().max(80).optional(), enabled: z.enum(['true', 'false', 'all']).default('all'), categoryId: uuid.optional() }).parse(request.query)
      const filters = ['1=1']
      const values: unknown[] = []
      if (query.keyword) { values.push(`%${query.keyword}%`); filters.push(`(p.name ILIKE $${values.length} OR p.subtitle ILIKE $${values.length})`) }
      if (query.enabled !== 'all') { values.push(query.enabled === 'true'); filters.push(`p.enabled=$${values.length}`) }
      if (query.categoryId) { values.push(query.categoryId); filters.push(`p.category_id=$${values.length}`) }
      const count = await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM products p WHERE ${filters.join(' AND ')}`, values)
      values.push(query.pageSize, (query.page - 1) * query.pageSize)
      const result = await db.query<AdminProductRow>(
        `${adminProductSelect} WHERE ${filters.join(' AND ')} GROUP BY p.id,c.id ORDER BY p.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
      )
      return { data: { items: result.rows.map(mapAdminProduct), total: Number(count.rows[0]?.total || 0), page: query.page, pageSize: query.pageSize } }
    })

    protectedAdmin.post('/products', async request => {
      const body = productBody.parse(request.body)
      const created = await db.transaction(async client => {
        try {
          const product = await client.query<{ id: string }>(
            `INSERT INTO products(category_id,name,subtitle,description,image_url,badge,sales,enabled)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [body.categoryId, body.name, body.subtitle, body.description, body.image, body.badge, body.sales, body.enabled]
          )
          const productId = product.rows[0]!.id
          for (const sku of body.skus) {
            await client.query(
              `INSERT INTO product_skus(product_id,specification,price_cents,original_price_cents,stock,enabled)
               VALUES($1,$2,$3,$4,$5,$6)`, [productId, sku.specification, sku.priceCents, sku.originalPriceCents, sku.stock, sku.enabled]
            )
          }
          return productId
        } catch (error) {
          if (pgCode(error) === '23505') throw conflict('PRODUCT_EXISTS', 'Product or SKU already exists')
          if (pgCode(error) === '23503') throw notFound('Category not found')
          throw error
        }
      })
      await audit(db, request, 'CREATE', 'product', created, { name: body.name, skuCount: body.skus.length })
      return { data: { id: created } }
    })

    protectedAdmin.patch('/products/:id', async request => {
      const { id } = z.object({ id: uuid }).parse(request.params)
      const body = productPatch.parse(request.body)
      const fields: string[] = []
      const values: unknown[] = []
      for (const [key, column] of [['categoryId', 'category_id'], ['name', 'name'], ['subtitle', 'subtitle'], ['description', 'description'], ['image', 'image_url'], ['badge', 'badge'], ['sales', 'sales'], ['enabled', 'enabled']] as const) {
        if (body[key] !== undefined) { values.push(body[key]); fields.push(`${column}=$${values.length}`) }
      }
      fields.push('updated_at=now()')
      values.push(id)
      try {
        const result = await db.query<{ id: string }>(`UPDATE products SET ${fields.join(',')} WHERE id=$${values.length} RETURNING id`, values)
        if (!result.rows[0]) throw notFound('Product not found')
        await audit(db, request, 'UPDATE', 'product', id, body)
        return { data: { success: true } }
      } catch (error) {
        if (pgCode(error) === '23505') throw conflict('PRODUCT_EXISTS', 'Product name already exists')
        if (pgCode(error) === '23503') throw notFound('Category not found')
        throw error
      }
    })

    protectedAdmin.patch('/skus/:id', async request => {
      const { id } = z.object({ id: uuid }).parse(request.params)
      const body = skuPatch.parse(request.body)
      const result = await db.transaction(async client => {
        const current = await client.query<{ price_cents: number; original_price_cents: number | null }>(
          'SELECT price_cents,original_price_cents FROM product_skus WHERE id=$1 FOR UPDATE', [id]
        )
        if (!current.rows[0]) throw notFound('SKU not found')
        const price = body.priceCents ?? current.rows[0].price_cents
        const original = body.originalPriceCents === undefined ? current.rows[0].original_price_cents : body.originalPriceCents
        if (original !== null && original < price) throw new AppError(400, 'INVALID_PRICE', 'Original price must be greater than or equal to price')
        const fields: string[] = []
        const values: unknown[] = []
        for (const [key, column] of [['specification', 'specification'], ['priceCents', 'price_cents'], ['originalPriceCents', 'original_price_cents'], ['stock', 'stock'], ['enabled', 'enabled']] as const) {
          if (body[key] !== undefined) { values.push(body[key]); fields.push(`${column}=$${values.length}`) }
        }
        values.push(id)
        try {
          await client.query(`UPDATE product_skus SET ${fields.join(',')} WHERE id=$${values.length}`, values)
        } catch (error) {
          if (pgCode(error) === '23505') throw conflict('SKU_EXISTS', 'SKU specification already exists for this product')
          throw error
        }
        return { price, original }
      })
      await audit(db, request, 'UPDATE', 'sku', id, body)
      return { data: { success: true, ...result } }
    })

    protectedAdmin.get('/orders', async request => {
      const query = pageQuery.extend({ status: status.optional(), orderNo: z.string().trim().max(40).optional() }).parse(request.query)
      const filters = ['1=1']
      const values: unknown[] = []
      if (query.status) { values.push(query.status); filters.push(`o.status=$${values.length}`) }
      if (query.orderNo) { values.push(`%${query.orderNo}%`); filters.push(`o.order_no ILIKE $${values.length}`) }
      const count = await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM orders o WHERE ${filters.join(' AND ')}`, values)
      values.push(query.pageSize, (query.page - 1) * query.pageSize)
      const result = await db.query<{
        id: string; order_no: string; user_id: string; nickname: string | null; status: string; payable_cents: number;
        created_at: Date; item_count: number; first_product_name: string | null; shipping_carrier: string | null; tracking_no: string | null
      }>(
        `SELECT o.id,o.order_no,o.user_id,u.nickname,o.status,o.payable_cents,o.created_at,
                count(i.id)::int AS item_count,min(i.product_name) AS first_product_name,o.shipping_carrier,o.tracking_no
         FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_items i ON i.order_id=o.id
         WHERE ${filters.join(' AND ')} GROUP BY o.id,u.id ORDER BY o.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      return { data: { items: result.rows.map(row => ({
        id: row.id, orderNo: row.order_no, userId: row.user_id, nickname: row.nickname, status: row.status,
        payableCents: row.payable_cents, createdAt: row.created_at.toISOString(), itemCount: row.item_count,
        firstProductName: row.first_product_name, shippingCarrier: row.shipping_carrier, trackingNo: row.tracking_no
      })), total: Number(count.rows[0]?.total || 0), page: query.page, pageSize: query.pageSize } }
    })

    protectedAdmin.get('/orders/:id', async request => {
      const { id } = z.object({ id: uuid }).parse(request.params)
      return { data: await readAdminOrder(db, id) }
    })

    protectedAdmin.post('/orders/:id/ship', async request => {
      const { id } = z.object({ id: uuid }).parse(request.params)
      const body = z.object({ carrier: z.string().trim().min(1).max(80), trackingNo: z.string().trim().min(4).max(100) }).parse(request.body)
      const result = await db.query<{ id: string }>(
        `UPDATE orders SET status='SHIPPED',shipping_carrier=$1,tracking_no=$2,shipped_at=now(),updated_at=now()
         WHERE id=$3 AND status='PAID' RETURNING id`, [body.carrier, body.trackingNo, id]
      )
      if (!result.rows[0]) {
        const exists = await db.query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [id])
        if (!exists.rows[0]) throw notFound('Order not found')
        throw conflict('ORDER_CANNOT_SHIP', 'Only paid orders can be shipped')
      }
      await audit(db, request, 'SHIP', 'order', id, body)
      return { data: await readAdminOrder(db, id) }
    })

    protectedAdmin.get('/users', async request => {
      const query = pageQuery.extend({ keyword: z.string().trim().max(80).optional() }).parse(request.query)
      const values: unknown[] = []
      const filter = query.keyword ? (values.push(`%${query.keyword}%`), 'WHERE u.nickname ILIKE $1 OR u.openid ILIKE $1') : ''
      const count = await db.query<{ total: string }>(`SELECT count(*)::text AS total FROM users u ${filter}`, values)
      values.push(query.pageSize, (query.page - 1) * query.pageSize)
      const result = await db.query<{ id: string; openid: string; nickname: string | null; avatar_url: string | null; created_at: Date; order_count: number; spent_cents: string }>(
        `SELECT u.id,u.openid,u.nickname,u.avatar_url,u.created_at,count(o.id)::int AS order_count,
                COALESCE(sum(CASE WHEN o.status IN ('PAID','SHIPPED','COMPLETED') THEN o.payable_cents ELSE 0 END),0)::text AS spent_cents
         FROM users u LEFT JOIN orders o ON o.user_id=u.id ${filter}
         GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
      )
      return { data: { items: result.rows.map(row => ({
        id: row.id, openid: row.openid, nickname: row.nickname, avatarUrl: row.avatar_url,
        createdAt: row.created_at.toISOString(), orderCount: row.order_count, spentCents: Number(row.spent_cents)
      })), total: Number(count.rows[0]?.total || 0), page: query.page, pageSize: query.pageSize } }
    })

    await protectedAdmin.register(async superAdmin => {
      superAdmin.addHook('preHandler', adminAuth.requireSuperAdmin)

      superAdmin.get('/accounts', async () => {
        const result = await db.query<{ id: string; username: string; display_name: string; role: AdminRole; enabled: boolean; last_login_at: Date | null; created_at: Date }>(
          'SELECT id,username,display_name,role,enabled,last_login_at,created_at FROM admin_users ORDER BY created_at'
        )
        return { data: result.rows.map(row => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, enabled: row.enabled, lastLoginAt: row.last_login_at?.toISOString() || null, createdAt: row.created_at.toISOString() })) }
      })

      superAdmin.post('/accounts', async request => {
        const body = createAdminBody.parse(request.body)
        const passwordHash = await hashAdminPassword(body.password)
        try {
          const result = await db.query<{ id: string }>(
            `INSERT INTO admin_users(username,password_hash,display_name,role) VALUES($1,$2,$3,$4) RETURNING id`,
            [body.username, passwordHash, body.displayName, body.role]
          )
          await audit(db, request, 'CREATE', 'admin_user', result.rows[0]!.id, { username: body.username, role: body.role })
          return { data: { id: result.rows[0]!.id, username: body.username, displayName: body.displayName, role: body.role, enabled: true } }
        } catch (error) {
          if (pgCode(error) === '23505') throw conflict('ADMIN_EXISTS', 'Administrator username already exists')
          throw error
        }
      })

      superAdmin.patch('/accounts/:id', async request => {
        const { id } = z.object({ id: uuid }).parse(request.params)
        const body = patchAdminBody.parse(request.body)
        if (id === request.admin?.id && (body.enabled === false || (body.role && body.role !== 'SUPER_ADMIN'))) {
          throw conflict('SELF_LOCKOUT', 'You cannot disable or demote your own account')
        }
        const fields: string[] = []
        const values: unknown[] = []
        if (body.password) { values.push(await hashAdminPassword(body.password)); fields.push(`password_hash=$${values.length}`) }
        if (body.displayName !== undefined) { values.push(body.displayName); fields.push(`display_name=$${values.length}`) }
        if (body.role !== undefined) { values.push(body.role); fields.push(`role=$${values.length}`) }
        if (body.enabled !== undefined) { values.push(body.enabled); fields.push(`enabled=$${values.length}`) }
        fields.push('updated_at=now()')
        values.push(id)
        const result = await db.query<{ id: string }>(`UPDATE admin_users SET ${fields.join(',')} WHERE id=$${values.length} RETURNING id`, values)
        if (!result.rows[0]) throw notFound('Administrator not found')
        await audit(db, request, 'UPDATE', 'admin_user', id, { fields: Object.keys(body).filter(key => key !== 'password') })
        return { data: { success: true } }
      })

      superAdmin.get('/audit-logs', async request => {
        const query = pageQuery.parse(request.query)
        const values = [query.pageSize, (query.page - 1) * query.pageSize]
        const result = await db.query<{ id: string; username: string | null; action: string; resource_type: string; resource_id: string | null; details: Record<string, unknown>; ip_address: string | null; created_at: Date }>(
          `SELECT l.id,a.username,l.action,l.resource_type,l.resource_id,l.details,l.ip_address,l.created_at
           FROM admin_audit_logs l LEFT JOIN admin_users a ON a.id=l.admin_user_id
           ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`, values
        )
        return { data: result.rows.map(row => ({ id: row.id, username: row.username, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, details: row.details, ipAddress: row.ip_address, createdAt: row.created_at.toISOString() })) }
      })
    }, { prefix: '/super' })
  }, { prefix: '/admin' })
}
