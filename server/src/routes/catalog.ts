import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Database } from '../db.js'
import { notFound } from '../errors.js'

const listSchema = z.object({
  categoryId: z.string().uuid().optional(),
  keyword: z.string().trim().max(80).optional(),
  sort: z.enum(['default', 'sales', 'price']).default('default'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
})

interface ProductRow {
  id: string
  category_id: string
  category_name: string
  name: string
  subtitle: string
  description: string
  image_url: string
  badge: string | null
  sales: number
  skus: Array<{ id: string; specification: string; priceCents: number; originalPriceCents: number | null; stock: number }>
}

const mapProduct = (row: ProductRow) => ({
  id: row.id,
  categoryId: row.category_id,
  category: row.category_name,
  name: row.name,
  subtitle: row.subtitle,
  description: row.description,
  image: row.image_url,
  badge: row.badge,
  sales: row.sales,
  skus: row.skus
})

const productSelect = `
  SELECT p.id, p.category_id, c.name AS category_name, p.name, p.subtitle,
         p.description, p.image_url, p.badge, p.sales,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'specification', s.specification,
           'priceCents', s.price_cents, 'originalPriceCents', s.original_price_cents,
           'stock', s.stock
         ) ORDER BY s.price_cents) FILTER (WHERE s.id IS NOT NULL), '[]') AS skus
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN product_skus s ON s.product_id = p.id AND s.enabled = true
`

export async function catalogRoutes(app: FastifyInstance, options: { db: Database }) {
  const { db } = options

  app.get('/categories', async () => {
    const result = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE enabled = true ORDER BY sort_order, name'
    )
    return { data: result.rows }
  })

  app.get('/products', async request => {
    const query = listSchema.parse(request.query)
    const filters = ['p.enabled = true', 'c.enabled = true']
    const values: unknown[] = []
    if (query.categoryId) {
      values.push(query.categoryId)
      filters.push(`p.category_id = $${values.length}`)
    }
    if (query.keyword) {
      values.push(`%${query.keyword}%`)
      filters.push(`(p.name ILIKE $${values.length} OR p.subtitle ILIKE $${values.length})`)
    }
    const orderBy = query.sort === 'sales'
      ? 'p.sales DESC, p.created_at DESC'
      : query.sort === 'price'
        ? 'MIN(s.price_cents) ASC, p.created_at DESC'
        : 'p.created_at DESC'

    const count = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${filters.join(' AND ')}`,
      values
    )
    values.push(query.pageSize, (query.page - 1) * query.pageSize)
    const rows = await db.query<ProductRow>(
      `${productSelect}
       WHERE ${filters.join(' AND ')}
       GROUP BY p.id, c.id
       ORDER BY ${orderBy}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    )
    return { data: { items: rows.rows.map(mapProduct), total: Number(count.rows[0]?.total || 0), page: query.page, pageSize: query.pageSize } }
  })

  app.get('/products/:id', async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const result = await db.query<ProductRow>(
      `${productSelect} WHERE p.id = $1 AND p.enabled = true GROUP BY p.id, c.id`, [id]
    )
    if (!result.rows[0]) throw notFound('Product not found')
    return { data: mapProduct(result.rows[0]) }
  })
}
