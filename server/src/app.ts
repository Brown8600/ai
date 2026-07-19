import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'
import type { AppConfig } from './config.js'
import type { Database } from './db.js'
import { createAuth } from './auth.js'
import { createWechatPay } from './wechat-pay.js'
import { AppError } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { catalogRoutes } from './routes/catalog.js'
import { commerceRoutes } from './routes/commerce.js'
import { paymentRoutes } from './routes/payments.js'
import { adminRoutes } from './routes/admin.js'
import { createAdminAuth } from './admin-auth.js'

export async function buildApp(config: AppConfig, db: Database) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: config.NODE_ENV === 'production' ? 1 : false,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id'
  })

  // 微信支付验签必须使用未经重新序列化的原始请求体。
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      request.rawBody = body as string
      done(null, JSON.parse(body as string))
    } catch (error) {
      done(error as Error)
    }
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: config.CORS_ORIGIN ? config.CORS_ORIGIN.split(',').map(item => item.trim()) : false,
    credentials: true
  })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  const auth = createAuth(config, db)
  const adminAuth = createAdminAuth(config, db)
  const pay = createWechatPay(config)

  app.get('/health', async () => {
    await db.query('SELECT 1')
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ code: 'ROUTE_NOT_FOUND', message: 'Route not found', requestId: request.id })
  })

  app.setErrorHandler((error, request, reply) => {
    // pnpm 工作区可能加载多个 zod 副本，不能只依赖 instanceof 判断。
    const isZodError = error instanceof ZodError || (
      (error as { name?: string }).name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues)
    )
    if (isZodError) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: request.id, details: (error as ZodError).flatten() })
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.message, requestId: request.id, details: error.details })
    }
    request.log.error({ err: error }, 'Unhandled request error')
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id })
  })

  // 子插件在注册时继承父级错误处理器，因此路由注册必须位于处理器之后。
  await app.register(async api => {
    await api.register(authRoutes, { config, db, auth })
    await api.register(catalogRoutes, { db })
    await api.register(commerceRoutes, { db, auth })
    await api.register(paymentRoutes, { config, db, auth, pay })
    await api.register(adminRoutes, { config, db, adminAuth })
  }, { prefix: '/api/v1' })

  return app
}
