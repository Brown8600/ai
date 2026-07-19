import type { FastifyReply, FastifyRequest } from 'fastify'
import { jwtVerify, SignJWT } from 'jose'
import type { AppConfig } from './config.js'
import type { Database } from './db.js'
import { forbidden, unauthorized } from './errors.js'

export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR'

export interface AdminIdentity {
  id: string
  username: string
  displayName: string
  role: AdminRole
}

declare module 'fastify' {
  interface FastifyRequest { admin: AdminIdentity | null }
}

export function createAdminAuth(config: AppConfig, db: Database) {
  const secret = new TextEncoder().encode(config.JWT_SECRET)

  async function issueAccessToken(admin: AdminIdentity) {
    return new SignJWT({ type: 'admin-access', role: admin.role, username: admin.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('xingxuan-api')
      .setAudience('xingxuan-admin')
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime(`${config.ADMIN_ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret)
  }

  async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw unauthorized('Administrator authentication required')
    let adminId: string
    try {
      const { payload } = await jwtVerify(authorization.slice(7), secret, {
        issuer: 'xingxuan-api',
        audience: 'xingxuan-admin'
      })
      if (payload.type !== 'admin-access' || !payload.sub) throw new Error('Invalid administrator token')
      adminId = payload.sub
    } catch {
      throw unauthorized('Administrator token is invalid or expired')
    }
    const result = await db.query<{
      id: string; username: string; display_name: string; role: AdminRole
    }>(
      `SELECT id,username,display_name,role FROM admin_users
       WHERE id=$1 AND enabled=true`, [adminId]
    )
    const row = result.rows[0]
    if (!row) throw unauthorized('Administrator is disabled or missing')
    request.admin = { id: row.id, username: row.username, displayName: row.display_name, role: row.role }
  }

  async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.admin) await authenticate(request, reply)
    if (request.admin?.role !== 'SUPER_ADMIN') throw forbidden('Super administrator role required')
  }

  return { issueAccessToken, authenticate, requireSuperAdmin }
}

export type AdminAuthService = ReturnType<typeof createAdminAuth>
