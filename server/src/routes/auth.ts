import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import type { Database } from '../db.js'
import type { AuthService } from '../auth.js'
import { exchangeWechatCode } from '../wechat.js'

const loginSchema = z.object({ code: z.string().min(3).max(256) })
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(512) })

export async function authRoutes(app: FastifyInstance, options: { config: AppConfig; db: Database; auth: AuthService }) {
  const { config, db, auth } = options

  app.post('/auth/wechat', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const { code } = loginSchema.parse(request.body)
    const session = await exchangeWechatCode(config, code)
    const userResult = await db.query<{ id: string; nickname: string | null; avatar_url: string | null }>(
      `INSERT INTO users(openid, unionid) VALUES ($1, $2)
       ON CONFLICT(openid) DO UPDATE SET unionid = COALESCE(EXCLUDED.unionid, users.unionid), updated_at = now()
       RETURNING id, nickname, avatar_url`, [session.openid, session.unionid]
    )
    const user = userResult.rows[0]!

    // 开发登录自动创建一条地址，保证本地可完整演示下单流程；生产环境绝不执行。
    if (config.ALLOW_DEV_LOGIN && code.startsWith('dev-')) {
      await db.query(
        `INSERT INTO addresses(user_id, name, phone, province, city, district, detail, is_default)
         SELECT $1, '测试用户', '13800000000', '上海市', '上海市', '浦东新区', '世纪大道 100 号', true
         WHERE NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1)`, [user.id]
      )
    }
    return { data: { ...(await auth.issueTokenPair(user.id)), user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url } } }
  })

  app.post('/auth/refresh', async request => {
    const { refreshToken } = refreshSchema.parse(request.body)
    const userId = await auth.rotateRefreshToken(refreshToken)
    return { data: await auth.issueTokenPair(userId) }
  })

  app.post('/auth/logout', async request => {
    const { refreshToken } = refreshSchema.parse(request.body)
    await auth.revokeRefreshToken(refreshToken)
    return { data: { success: true } }
  })

  app.get('/me', { preHandler: auth.authenticate }, async request => {
    const result = await db.query<{ id: string; nickname: string | null; avatar_url: string | null; created_at: Date }>(
      'SELECT id, nickname, avatar_url, created_at FROM users WHERE id = $1', [request.userId]
    )
    const user = result.rows[0]!
    return { data: { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url, createdAt: user.created_at.toISOString() } }
  })
}
