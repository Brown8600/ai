import type { AppConfig } from './config.js'
import { AppError } from './errors.js'

interface Code2SessionResponse {
  openid?: string
  unionid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

/** 使用小程序临时 code 换取 openid。AppSecret 只存在于服务端环境变量。 */
export async function exchangeWechatCode(config: AppConfig, code: string) {
  if (config.ALLOW_DEV_LOGIN && code.startsWith('dev-')) {
    return { openid: `dev:${code.slice(4) || 'default'}`, unionid: null }
  }
  if (!config.WX_APP_ID || !config.WX_APP_SECRET) {
    throw new AppError(503, 'WECHAT_NOT_CONFIGURED', 'WeChat login is not configured')
  }
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.search = new URLSearchParams({
    appid: config.WX_APP_ID,
    secret: config.WX_APP_SECRET,
    js_code: code,
    grant_type: 'authorization_code'
  }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new AppError(502, 'WECHAT_UNAVAILABLE', 'WeChat login service is unavailable')
  const result = await response.json() as Code2SessionResponse
  if (!result.openid || result.errcode) {
    throw new AppError(401, 'WECHAT_CODE_INVALID', result.errmsg || 'Invalid WeChat login code')
  }
  return { openid: result.openid, unionid: result.unionid || null }
}
