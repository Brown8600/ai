<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import BottomNav from '@/components/BottomNav.vue'
import { useCartStore } from '@/stores/cart'
import { formatMoney } from '@/utils/money'

// 购物车页面直接消费 Pinia 中的共享状态，修改会同步影响底部角标和结算页。
const cart = useCartStore()

/**
 * 进入结算前必须至少选择一件商品。
 * 结算页不再重复传递商品参数，而是读取 store 中的 selectedItems。
 */
function checkout() {
  if (!cart.selectedItems.length) {
    return uni.showToast({ title: '请选择商品', icon: 'none' })
  }
  uni.navigateTo({ url: '/pages/checkout/index' })
}

// 空购物车返回首页时重建主页面栈。
function goHome() { uni.reLaunch({ url: '/pages/home/index' }) }

async function changeQuantity(index: number, step: number) {
  try { await cart.changeQuantity(index, step) }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '数量更新失败', icon: 'none' }) }
}

async function remove(index: number) {
  try { await cart.remove(index) }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' }) }
}

onShow(() => {
  cart.load().catch(error => uni.showToast({ title: error instanceof Error ? error.message : '购物车加载失败', icon: 'none' }))
})
</script>

<template><view class="page cart-page">
  <!-- 有商品时渲染购物车条目；商品 id + 规格共同作为稳定 key -->
  <view v-if="cart.items.length" class="cart-list"><view v-for="(item,index) in cart.items" :key="`${item.id}-${item.specification}`" class="cart-item">
    <text class="check" :class="{active:item.selected}" @tap="item.selected=!item.selected">{{ item.selected?'✓':'' }}</text><image :src="item.image" mode="aspectFill" /><view class="info"><text class="name">{{ item.name }}</text><text class="spec">{{ item.specification }}</text><view class="row"><text class="price">{{ formatMoney(item.priceCents) }}</text><view class="stepper"><text @tap="changeQuantity(index,-1)">−</text><text>{{ item.quantity }}</text><text @tap="changeQuantity(index,1)">＋</text></view></view><text class="delete" @tap="remove(index)">删除</text></view>
  </view></view>
  <!-- 购物车空状态 -->
  <view v-else class="empty"><text class="bag">▱</text><text>购物车还是空的</text><button @tap="goHome">去逛逛</button></view>
  <!-- 结算栏金额和件数均基于已勾选商品实时计算 -->
  <view v-if="cart.items.length" class="settlement"><view @tap="cart.toggleAll"><text class="check" :class="{active:cart.allSelected}">{{ cart.allSelected?'✓':'' }}</text><text>全选</text></view><view class="total"><text>预估：</text><text class="price">{{ formatMoney(cart.totalCents) }}</text></view><button @tap="checkout">结算 ({{ cart.selectedItems.length }})</button></view>
  <BottomNav current="cart" />
</view></template>

<style scoped lang="scss">
.cart-list { padding:20rpx 24rpx; }.cart-item { position:relative; margin-bottom:18rpx; padding:26rpx 22rpx; display:flex; align-items:center; gap:20rpx; background:#fff; border-radius:8rpx; }.check { display:inline-block; width:38rpx; height:38rpx; line-height:34rpx; text-align:center; border:2rpx solid #bfc3c9; border-radius:50%; font-size:23rpx; }.check.active { background:#e94335; color:#fff; border-color:#e94335; }.cart-item image { width:180rpx; height:180rpx; background:#eee; border-radius:4rpx; }.info { min-width:0; flex:1; }.name,.spec { display:block; }.name { font-size:28rpx; font-weight:650; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.spec { margin-top:14rpx; color:#8a8e95; font-size:22rpx; }.row { margin-top:34rpx; display:flex; justify-content:space-between; align-items:center; }.price { font-size:31rpx; }.stepper { display:flex; }.stepper text { width:52rpx; height:48rpx; line-height:48rpx; text-align:center; background:#f2f3f5; font-size:22rpx; }.delete { position:absolute; right:22rpx; top:72rpx; color:#999; font-size:21rpx; }.empty { display:flex; flex-direction:column; align-items:center; gap:22rpx; }.bag { font-size:100rpx; color:#c5c8cc; }.empty button { width:180rpx; height:64rpx; line-height:64rpx; color:#e94335; border:2rpx solid #e94335; background:#fff; font-size:24rpx; border-radius:4rpx; }
.settlement { position:fixed; z-index:25; left:0; right:0; bottom:108rpx; height:100rpx; padding-left:28rpx; display:flex; align-items:center; background:#fff; border-top:1rpx solid #eee; }.settlement>view:first-child { display:flex; align-items:center; gap:12rpx; font-size:24rpx; }.total { margin-left:auto; font-size:24rpx; }.total .price { font-size:34rpx; }.settlement button { margin:0 0 0 20rpx; width:230rpx; height:100rpx; line-height:100rpx; background:#e94335; color:#fff; border-radius:0; font-size:28rpx; }.settlement button::after { border:0; }
</style>
