import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default(''),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(28_800),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ALLOW_DEV_LOGIN: z.string().default('false').transform(value => value === 'true'),
  WX_APP_ID: z.string().default(''),
  WX_APP_SECRET: z.string().default(''),
  WX_MCH_ID: z.string().default(''),
  WX_MCH_SERIAL_NO: z.string().default(''),
  WX_MCH_PRIVATE_KEY_PATH: z.string().default(''),
  WX_PLATFORM_CERT_PATH: z.string().default(''),
  WX_API_V3_KEY: z.string().default(''),
  WX_PAY_NOTIFY_URL: z.string().default(''),
  ADMIN_SEED_USERNAME: z.string().default(''),
  ADMIN_SEED_PASSWORD: z.string().default(''),
  ADMIN_SEED_DISPLAY_NAME: z.string().default('系统管理员')
})

export type AppConfig = z.infer<typeof envSchema>

/** 在进程启动阶段一次性校验环境，避免服务运行后才暴露缺失配置。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const details = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${details}`)
  }
  if (result.data.NODE_ENV === 'production' && result.data.ALLOW_DEV_LOGIN) {
    throw new Error('ALLOW_DEV_LOGIN must be false in production')
  }
  if ((result.data.ADMIN_SEED_USERNAME && !result.data.ADMIN_SEED_PASSWORD) ||
      (!result.data.ADMIN_SEED_USERNAME && result.data.ADMIN_SEED_PASSWORD)) {
    throw new Error('ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD must be configured together')
  }
  if (result.data.ADMIN_SEED_PASSWORD && result.data.ADMIN_SEED_PASSWORD.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD must contain at least 12 characters')
  }
  return result.data
}
