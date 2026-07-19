<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { commerceApi, ensureAuthenticated } from '@/api'
import type { Order } from '@/types'
import { formatMoney } from '@/utils/money'

// active 表示当前订单状态标签；后续可据此请求对应 status 的订单列表。
const active = ref(0)
const orders = ref<Order[]>([])
const loading = ref(false)

// 标签顺序与常见电商订单状态保持一致。
const tabs = [
  { label:'全部', status: undefined },
  { label:'待付款', status:'PENDING_PAYMENT' },
  { label:'待发货', status:'PAID' },
  { label:'待收货', status:'SHIPPED' },
  { label:'已完成', status:'COMPLETED' }
] as const

const statusText: Record<Order['status'], string> = {
  PENDING_PAYMENT:'待付款', PAID:'待发货', SHIPPED:'待收货', COMPLETED:'已完成', CANCELLED:'已取消'
}

async function loadOrders() {
  loading.value = true
  try {
    await ensureAuthenticated()
    orders.value = await commerceApi.orders(tabs[active.value].status)
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '订单加载失败', icon: 'none' })
  } finally { loading.value = false }
}

function selectTab(index: number) { active.value = index; void loadOrders() }

async function cancel(id: string) {
  await commerceApi.cancelOrder(id)
  await loadOrders()
}

async function confirm(id: string) {
  await commerceApi.confirmOrder(id)
  await loadOrders()
}

onShow(() => { void loadOrders() })
</script>

<template><view class="order-page">
  <!-- 横向状态筛选栏 -->
  <scroll-view scroll-x class="tabs"><text v-for="(item,index) in tabs" :key="item.label" :class="{active:index===active}" @tap="selectTab(index)">{{ item.label }}</text></scroll-view>
  <!-- 服务端订单快照确保历史商品名称和成交价不会随商品修改而变化。 -->
  <view v-for="order in orders" :key="order.id" class="order-card"><view class="head"><text>订单号 {{ order.orderNo }}</text><text>{{ statusText[order.status] }}</text></view><view v-for="item in order.items" :key="item.id" class="goods"><image :src="item.image" mode="aspectFill"/><view><text>{{ item.productName }}</text><text>{{ item.specification }} × {{ item.quantity }}</text></view><text>¥{{ formatMoney(item.unitPriceCents) }}</text></view><view class="total">共 {{ order.items.length }} 件商品　实付 <text>¥{{ formatMoney(order.payableCents) }}</text></view><view class="actions"><button v-if="order.status==='PENDING_PAYMENT'" @tap="cancel(order.id)">取消订单</button><button v-if="order.status==='SHIPPED'" @tap="confirm(order.id)">确认收货</button></view></view>
  <view v-if="loading" class="end">正在加载订单...</view><view v-else-if="!orders.length" class="end">暂无相关订单</view><view v-else class="end">没有更多订单了</view></view></template>

<style scoped lang="scss">
.tabs { white-space:nowrap; height:90rpx; background:#fff; }.tabs text { display:inline-block; width:150rpx; line-height:88rpx; text-align:center; font-size:25rpx; border-bottom:4rpx solid transparent; }.tabs .active { color:#e94335; border-color:#e94335; font-weight:700; }.order-card { margin:20rpx 24rpx; padding:26rpx; background:#fff; border-radius:7rpx; }.head { display:flex; justify-content:space-between; padding-bottom:23rpx; border-bottom:1rpx solid #eee; font-size:22rpx; }.head text:last-child { color:#e94335; }.goods { padding:24rpx 0; display:flex; align-items:center; gap:20rpx; }.goods image { width:145rpx; height:145rpx; background:#eee; }.goods>view:nth-child(2) { flex:1; }.goods view text { display:block; }.goods view text:first-child { font-size:26rpx; }.goods view text:last-child { margin-top:16rpx; color:#999; font-size:21rpx; }.goods>text { font-size:23rpx; }.total { padding:20rpx 0; text-align:right; font-size:22rpx; border-top:1rpx solid #eee; }.total text { font-size:28rpx; font-weight:700; }.actions { display:flex; justify-content:flex-end; gap:15rpx; }.actions button { margin:0; width:170rpx; height:62rpx; line-height:62rpx; background:#fff; border:1rpx solid #bbb; border-radius:4rpx; font-size:23rpx; }.actions button:last-child { color:#e94335; border-color:#e94335; }.end { padding:60rpx; text-align:center; color:#aaa; font-size:22rpx; }
</style>
