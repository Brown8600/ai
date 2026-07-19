import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { CartItem, Product, Sku } from '@/types'
import { cartApi, ensureAuthenticated } from '@/api'

export const useCartStore = defineStore('cart', () => {
  // 购物车是跨页面共享状态：详情页写入，购物车和结算页读取。
  const items = ref<CartItem[]>([])
  const loading = ref(false)

  // count 用于底部导航角标，统计件数而不是商品条目数。
  const count = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  // 只有勾选的商品会进入结算页和金额计算。
  const selectedItems = computed(() => items.value.filter(item => item.selected))
  const totalCents = computed(() => selectedItems.value.reduce((sum, item) => sum + item.priceCents * item.quantity, 0))

  // 空购物车不能视为“全选”，否则空态会显示错误的选中状态。
  const allSelected = computed(() => items.value.length > 0 && items.value.every(item => item.selected))

  /**
   * 添加商品到购物车。
   * 商品 id 与规格都相同时合并数量；规格不同则保留独立条目。
   */
  async function load() {
    loading.value = true
    try {
      await ensureAuthenticated()
      const result = await cartApi.list()
      const selectedIds = new Set(items.value.filter(item => item.selected).map(item => item.cartItemId))
      items.value = result.map(item => ({
        ...item.product,
        description: '',
        skus: [],
        cartItemId: item.id,
        skuId: item.skuId,
        priceCents: item.priceCents,
        stock: item.stock,
        quantity: item.quantity,
        specification: item.specification,
        selected: selectedIds.size ? selectedIds.has(item.id) : true
      }))
    } finally {
      loading.value = false
    }
  }

  async function add(product: Product, sku: Sku, quantity = 1) {
    await ensureAuthenticated()
    await cartApi.add(sku.id, quantity)
    await load()
    uni.showToast({ title: '已加入购物车', icon: 'success' })
  }

  /** 调整购买数量，并把合法范围限制在 1 到 99。 */
  async function changeQuantity(index: number, step: number) {
    const item = items.value[index]
    if (!item) return
    const quantity = Math.max(1, Math.min(99, item.quantity + step, item.stock))
    if (quantity === item.quantity) return
    await cartApi.update(item.cartItemId, quantity)
    item.quantity = quantity
  }

  /** 根据当前全选状态，批量切换所有购物车条目。 */
  function toggleAll() {
    const next = !allSelected.value
    items.value.forEach(item => { item.selected = next })
  }

  /** 删除指定索引的购物车条目。 */
  async function remove(index: number) {
    const item = items.value[index]
    if (!item) return
    await cartApi.remove(item.cartItemId)
    items.value.splice(index, 1)
  }

  /** 下单成功后仅移除本次已结算商品，未勾选商品继续保留。 */
  function clearSelected() { items.value = items.value.filter(item => !item.selected) }

  return { items, loading, count, selectedItems, totalCents, allSelected, load, add, changeQuantity, toggleAll, remove, clearSelected }
})
