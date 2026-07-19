import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { jwtVerify, SignJWT } from 'jose'
import type { AppConfig } from './config.js'
import type { Database } from './db.js'
import { unauthorized } from './errors.js'

declare module 'fastify' {
  interface FastifyRequest { userId: string | null }
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export function createAuth(config: AppConfig, db: Database) {
  const secret = new TextEncoder().encode(config.JWT_SECRET)

  async function createAccessToken(userId: string) {
    return new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret)
  }

  async function createRefreshToken(userId: string) {
    const token = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
    await db.query(
      'INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash(token), expiresAt]
    )
    return { token, expiresAt }
  }

  async function issueTokenPair(userId: string) {
    const [accessToken, refresh] = await Promise.all([
      createAccessToken(userId),
      createRefreshToken(userId)
    ])
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresAt: refresh.expiresAt.toISOString()
    }
  }

  async function rotateRefreshToken(token: string) {
    const hash = tokenHash(token)
    return db.transaction(async client => {
      const result = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM refresh_tokens
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
         FOR UPDATE`, [hash]
      )
      const current = result.rows[0]
      if (!current) throw unauthorized('Refresh token is invalid or expired')
      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [current.id])
      return current.user_id
    })
  }

  async function revokeRefreshToken(token: string) {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash(token)])
  }

  async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw unauthorized()
    try {
      const { payload } = await jwtVerify(authorization.slice(7), secret)
      if (payload.type !== 'access' || !payload.sub) throw new Error('Invalid token payload')
      request.userId = payload.sub
    } catch {
      throw unauthorized('Access token is invalid or expired')
    }
  }

  return { issueTokenPair, rotateRefreshToken, revokeRefreshToken, authenticate }
}

export type AuthService = ReturnType<typeof createAuth>
