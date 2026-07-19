import type { Address, Order, Product } from '@/types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '')
const ACCESS_TOKEN = 'xingxuan.accessToken'
const REFRESH_TOKEN = 'xingxuan.refreshToken'
let refreshPromise: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  data?: unknown
  auth?: boolean
  headers?: Record<string, string>
  retry?: boolean
}

function rawRequest<T>(path: string, options: RequestOptions = {}) {
  return new Promise<T>((resolve, reject) => {
    const token = uni.getStorageSync(ACCESS_TOKEN)
    uni.request({
      url: `${BASE_URL}${path}`,
      method: (options.method || 'GET') as 'GET',
      data: options.data as Record<string, unknown>,
      timeout: 12_000,
      header: {
        'content-type': 'application/json',
        ...(options.auth && token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers
      },
      success(response) {
        const body = response.data as { data?: T; code?: string; message?: string; details?: unknown }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body.data as T)
        else reject(new ApiError(response.statusCode, body.code || 'HTTP_ERROR', body.message || '请求失败', body.details))
      },
      fail(error) { reject(new ApiError(0, 'NETWORK_ERROR', error.errMsg || '网络连接失败')) }
    })
  })
}

async function refreshAccessToken() {
  const token = uni.getStorageSync(REFRESH_TOKEN)
  if (!token) return false
  try {
    const result = await rawRequest<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', data: { refreshToken: token } })
    uni.setStorageSync(ACCESS_TOKEN, result.accessToken)
    uni.setStorageSync(REFRESH_TOKEN, result.refreshToken)
    return true
  } catch {
    uni.removeStorageSync(ACCESS_TOKEN)
    uni.removeStorageSync(REFRESH_TOKEN)
    return false
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options)
  } catch (error) {
    if (options.auth && options.retry !== false && error instanceof ApiError && error.statusCode === 401) {
      refreshPromise ||= refreshAccessToken().finally(() => { refreshPromise = null })
      if (await refreshPromise) return rawRequest<T>(path, { ...options, retry: false })
    }
    throw error
  }
}

/** 获取真实微信 code；开发构建使用后端受控的 dev 登录，不依赖测试 AppID。 */
export async function ensureAuthenticated() {
  if (uni.getStorageSync(ACCESS_TOKEN)) return
  const code = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true'
    ? 'dev-local'
    : await new Promise<string>((resolve, reject) => uni.login({ provider: 'weixin', success: result => resolve(result.code), fail: reject }))
  const result = await rawRequest<{ accessToken: string; refreshToken: string; user: unknown }>('/auth/wechat', { method: 'POST', data: { code } })
  uni.setStorageSync(ACCESS_TOKEN, result.accessToken)
  uni.setStorageSync(REFRESH_TOKEN, result.refreshToken)
  return result.user
}

export const catalogApi = {
  categories: () => request<Array<{ id: string; name: string }>>('/categories'),
  products: (query: { categoryId?: string; keyword?: string; sort?: string; page?: number; pageSize?: number } = {}) => {
    const pairs = Object.entries(query).filter(([, value]) => value !== undefined && value !== '')
    const search = pairs.length ? `?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')}` : ''
    return request<{ items: Product[]; total: number; page: number; pageSize: number }>(`/products${search}`)
  },
  product: (id: string) => request<Product>(`/products/${id}`)
}

interface CartApiItem {
  id: string
  skuId: string
  quantity: number
  specification: string
  priceCents: number
  stock: number
  product: Omit<Product, 'description' | 'skus'>
}

export const cartApi = {
  list: () => request<CartApiItem[]>('/cart', { auth: true }),
  add: (skuId: string, quantity: number) => request<{ success: true }>('/cart/items', { method: 'POST', data: { skuId, quantity }, auth: true }),
  update: (id: string, quantity: number) => request<{ success: true }>(`/cart/items/${id}`, { method: 'PATCH', data: { quantity }, auth: true }),
  remove: (id: string) => request<{ success: true }>(`/cart/items/${id}`, { method: 'DELETE', auth: true })
}

export interface CheckoutQuote {
  quoteToken: string
  expiresAt: string
  lines: Array<{ skuId: string; productId: string; productName: string; specification: string; image: string; priceCents: number; quantity: number }>
  address: Address
  subtotalCents: number
  discountCents: number
  freightCents: number
  payableCents: number
}

export interface WechatPaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export const commerceApi = {
  addresses: () => request<Address[]>('/addresses', { auth: true }),
  addAddress: (address: Omit<Address, 'id'>) => request<{ id: string }>('/addresses', { method: 'POST', data: address, auth: true }),
  setDefaultAddress: (id: string) => request<{ success: true }>(`/addresses/${id}/default`, { method: 'PUT', auth: true }),
  quote: (items: Array<{ skuId: string; quantity: number }>, addressId: string) => request<CheckoutQuote>('/checkout/quote', { method: 'POST', data: { items, addressId }, auth: true }),
  createOrder: (quoteToken: string, remark: string, idempotencyKey: string) => request<Order>('/orders', { method: 'POST', data: { quoteToken, remark }, auth: true, headers: { 'Idempotency-Key': idempotencyKey } }),
  orders: (status?: string) => request<Order[]>(`/orders${status ? `?status=${status}` : ''}`, { auth: true }),
  cancelOrder: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'POST', auth: true }),
  confirmOrder: (id: string) => request<Order>(`/orders/${id}/confirm-receipt`, { method: 'POST', auth: true }),
  payment: (id: string) => request<WechatPaymentParams>(`/orders/${id}/payments/wechat`, { method: 'POST', auth: true })
}
