import type { Product } from '@/types'

/** 服务端金额统一使用整数分，展示时才格式化为元，避免浮点累计误差。 */
export const formatMoney = (cents: number) => (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)

export const lowestPriceCents = (product: Product) =>
  product.skus.length ? Math.min(...product.skus.map(sku => sku.priceCents)) : 0

export const lowestOriginalPriceCents = (product: Product) => {
  const prices = product.skus.map(sku => sku.originalPriceCents).filter((value): value is number => value !== null)
  return prices.length ? Math.min(...prices) : null
}
