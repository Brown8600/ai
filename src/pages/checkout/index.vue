<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useCartStore } from '@/stores/cart'
import { commerceApi, ensureAuthenticated, type CheckoutQuote } from '@/api'
import type { Address } from '@/types'
import { formatMoney } from '@/utils/money'

// remark 为订单备注；submitted 用于阻止用户连续点击造成重复下单。
const cart = useCartStore(), remark = ref(''), submitted = ref(false)
const addresses = ref<Address[]>([])
const selectedAddress = ref<Address | null>(null)
const quote = ref<CheckoutQuote | null>(null)
const preparing = ref(false)
const idempotencyKey = ref('')

async function prepareCheckout() {
  if (preparing.value) return
  preparing.value = true
  try {
    await ensureAuthenticated()
    if (!cart.items.length) await cart.load()
    addresses.value = await commerceApi.addresses()
    selectedAddress.value = addresses.value.find(item => item.isDefault) || addresses.value[0] || null
    if (!selectedAddress.value) {
      quote.value = null
      return
    }
    const nextQuote = await commerceApi.quote(
      cart.selectedItems.map(item => ({ skuId: item.skuId, quantity: item.quantity })),
      selectedAddress.value.id
    )
    quote.value = nextQuote
    idempotencyKey.value = `${nextQuote.quoteToken}-${Date.now()}`
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '结算信息加载失败', icon: 'none' })
  } finally {
    preparing.value = false
  }
}

function goAddress() { uni.navigateTo({ url: '/pages/address/index' }) }

/**
 * 创建真实订单。服务端消费短时报价并在事务内锁定库存。
 */
async function submit() {
  // 第一次提交后立即上锁，接口返回前的重复点击会被忽略。
  if (submitted.value || !quote.value) return
  submitted.value = true
  uni.showLoading({ title:'提交中' })
  try {
    const order = await commerceApi.createOrder(quote.value.quoteToken, remark.value, idempotencyKey.value)
    cart.clearSelected()
    if (import.meta.env.VITE_ENABLE_WECHAT_PAY === 'true') {
      const payment = await commerceApi.payment(order.id)
      await new Promise<void>((resolve, reject) => uni.requestPayment({ provider: 'wxpay', ...payment, success: () => resolve(), fail: reject }))
    }
    uni.showToast({ title:'下单成功', icon:'success' })
    setTimeout(() => uni.redirectTo({ url:'/pages/order/index' }), 600)
  } catch (error) {
    submitted.value = false
    uni.showToast({ title: error instanceof Error ? error.message : '下单失败', icon:'none' })
  } finally {
    uni.hideLoading()
  }
}

onShow(() => { void prepareCheckout() })
</script>

<template><view class="checkout-page">
  <!-- 地址必须属于当前登录用户，服务端报价会再次校验归属。 -->
  <view class="address" @tap="goAddress"><view class="pin">⌖</view><view v-if="selectedAddress"><text>{{ selectedAddress.name }} {{ selectedAddress.phone }}</text><text>{{ selectedAddress.province }}{{ selectedAddress.city }}{{ selectedAddress.district }}{{ selectedAddress.detail }}</text></view><view v-else><text>请添加收货地址</text><text>下单前需要完整的联系人和地址</text></view><text>›</text></view>
  <!-- 本次结算商品快照 -->
  <view class="goods"><text class="shop">星选商城</text><view v-for="item in quote?.lines || []" :key="item.skuId" class="goods-item"><image :src="item.image" mode="aspectFill"/><view><text>{{ item.productName }}</text><text>{{ item.specification }}</text><view><text class="price">{{ formatMoney(item.priceCents) }}</text><text>×{{ item.quantity }}</text></view></view></view></view>
  <view class="order-panel"><view><text>配送方式</text><text>快递配送</text></view><view><text>运费</text><text>{{ quote?.freightCents ? '¥'+formatMoney(quote.freightCents) : '免运费' }}</text></view><view><text>优惠券</text><text class="muted">暂无可用 ›</text></view><view><text>订单备注</text><input v-model="remark" placeholder="选填，请先与商家协商" /></view></view>
  <view class="summary"><view><text>商品金额</text><text>¥{{ formatMoney(quote?.subtotalCents || 0) }}</text></view><view><text>优惠</text><text>-¥{{ formatMoney(quote?.discountCents || 0) }}</text></view><view><text>运费</text><text>¥{{ formatMoney(quote?.freightCents || 0) }}</text></view></view>
  <!-- 底部支付栏；submitted 同时控制按钮禁用和提交函数防重 -->
  <view class="pay-bar safe-bottom"><text>共 {{ quote?.lines.length || 0 }} 件</text><view>合计：<text class="price">{{ formatMoney(quote?.payableCents || 0) }}</text></view><button :disabled="submitted || !quote" @tap="submit">提交订单</button></view>
</view></template>

<style scoped lang="scss">
.checkout-page { padding-bottom:140rpx; }.address { margin:20rpx 24rpx; padding:34rpx 26rpx; display:flex; align-items:center; gap:22rpx; background:#fff; border-bottom:5rpx solid #e94335; }.pin { font-size:42rpx; }.address>view:nth-child(2) { flex:1; }.address text { display:block; }.address view text:first-child { font-size:28rpx; font-weight:700; }.address view text:last-child { margin-top:14rpx; color:#666; font-size:23rpx; line-height:1.5; }.goods,.order-panel,.summary { margin:20rpx 24rpx; padding:26rpx; background:#fff; }.shop { display:block; margin-bottom:24rpx; font-size:27rpx; font-weight:700; }.goods-item { display:flex; gap:20rpx; margin-top:18rpx; }.goods-item image { width:150rpx; height:150rpx; background:#eee; }.goods-item>view { flex:1; }.goods-item>view>text { display:block; }.goods-item>view>text:first-child { font-size:26rpx; }.goods-item>view>text:nth-child(2) { margin-top:12rpx; color:#999; font-size:21rpx; }.goods-item>view>view { margin-top:28rpx; display:flex; justify-content:space-between; }.order-panel>view,.summary>view { min-height:88rpx; display:flex; align-items:center; justify-content:space-between; border-bottom:1rpx solid #eee; font-size:24rpx; }.order-panel input { width:410rpx; text-align:right; font-size:23rpx; }.summary>view:last-child { border:0; }.pay-bar { position:fixed; left:0; right:0; bottom:0; min-height:110rpx; display:flex; align-items:center; background:#fff; border-top:1rpx solid #eee; }.pay-bar>text { margin-left:25rpx; color:#888; font-size:21rpx; }.pay-bar>view { margin-left:auto; font-size:24rpx; }.pay-bar .price { font-size:34rpx; }.pay-bar button { width:230rpx; height:110rpx; margin:0 0 0 18rpx; line-height:110rpx; background:#e94335; color:#fff; border-radius:0; font-size:28rpx; }.pay-bar button::after { border:0; }
</style>
