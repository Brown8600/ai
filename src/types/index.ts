export interface Sku {
  id: string
  specification: string
  priceCents: number
  originalPriceCents: number | null
  stock: number
}

/** 商城商品的基础数据结构，价格和库存由 SKU 决定。 */
export interface Product {
  id: string
  categoryId: string
  name: string
  subtitle: string
  description: string
  category: string
  image: string
  badge: string | null
  sales: number
  skus: Sku[]
}

/**
 * 购物车条目在商品基础信息上增加购买态字段。
 * 同一商品选择不同 specification 时会作为两条购物车记录存在。
 */
export interface CartItem extends Product {
  cartItemId: string
  skuId: string
  priceCents: number
  stock: number
  quantity: number
  selected: boolean
  specification: string
}

export interface Address {
  id: string
  name: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  isDefault: boolean
}

export interface OrderItem {
  id: string
  productId: string
  skuId: string
  productName: string
  specification: string
  image: string
  unitPriceCents: number
  quantity: number
}

export interface Order {
  id: string
  orderNo: string
  status: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
  subtotalCents: number
  discountCents: number
  freightCents: number
  payableCents: number
  remark: string
  address: Address
  items: OrderItem[]
  paymentDeadline: string
  createdAt: string
}
