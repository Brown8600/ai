<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { catalogApi } from '@/api'
import { useCartStore } from '@/stores/cart'
import type { Product } from '@/types'
import { formatMoney } from '@/utils/money'

// 页面局部状态：商品 id、选中规格、购买数量和收藏展示状态。
const id = ref(''), selected = ref(0), quantity = ref(1), favorite = ref(false)
const product = ref<Product | null>(null)

// 路由 id 变化后，product 会自动重新计算。
const selectedSku = computed(() => product.value?.skus[selected.value] || null)
const cart = useCartStore()
onLoad(async query => {
  id.value = String(query?.id || '')
  try {
    product.value = await catalogApi.product(id.value)
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '商品加载失败', icon: 'none' })
  }
})

// 将当前规格和数量写入全局购物车。
async function addCart() {
  if (!product.value || !selectedSku.value) return
  await cart.add(product.value, selectedSku.value, quantity.value)
}

// “立即购买”复用购物车结算模型，先写入条目再进入确认订单页。
async function buyNow() {
  await addCart()
  uni.navigateTo({ url:'/pages/checkout/index' })
}
function goCart() { uni.reLaunch({ url: '/pages/cart/index' }) }
</script>

<template>
  <view v-if="product" class="detail-page">
    <!-- 商品主图和价格信息 -->
    <image class="hero-image" :src="product.image" mode="aspectFill" />
    <view class="product-info"><view class="price-row"><text class="price">{{ formatMoney(selectedSku?.priceCents || 0) }}</text><text v-if="selectedSku?.originalPriceCents">¥{{ formatMoney(selectedSku.originalPriceCents) }}</text><text class="sales">已售 {{ product.sales }}</text></view><text class="title">{{ product.name }}</text><text class="subtitle">{{ product.subtitle }}</text></view>
    <!-- SKU 规格选择；当前 Mock 仅包含单维规格 -->
    <view class="panel"><text class="label">规格</text><view class="options"><text v-for="(item,index) in product.skus" :key="item.id" :class="{active:index===selected}" @tap="selected=index;quantity=1">{{ item.specification }}</text></view></view>
    <view class="panel quantity"><text class="label">数量</text><view class="stepper"><text @tap="quantity=Math.max(1,quantity-1)">−</text><text>{{ quantity }}</text><text @tap="quantity=Math.min(selectedSku?.stock || 1,quantity+1)">＋</text></view></view>
    <view class="service-panel"><text>正品保障</text><text>七天无理由退换</text><text>48 小时内发货</text></view>
    <view class="detail-copy"><text>商品详情</text><text>{{ product.description }}</text></view>
    <!-- 固定购买操作栏，购物车角标读取 Pinia 实时件数 -->
    <view class="action safe-bottom"><view @tap="favorite=!favorite"><text>{{ favorite?'♥':'♡' }}</text><text>收藏</text></view><view @tap="goCart"><text>▱</text><text>购物车</text><text v-if="cart.count" class="cart-count">{{ cart.count }}</text></view><button class="cart-btn" :disabled="!selectedSku?.stock" @tap="addCart">加入购物车</button><button class="buy-btn" :disabled="!selectedSku?.stock" @tap="buyNow">立即购买</button></view>
  </view>
  <view v-else class="empty">正在加载商品...</view>
</template>

<style scoped lang="scss">
.detail-page { padding-bottom:150rpx; }.hero-image { display:block; width:100%; height:750rpx; background:#eceef1; }.product-info,.panel,.service-panel,.detail-copy { margin-top:16rpx; padding:28rpx; background:#fff; }.price-row { display:flex; align-items:baseline; gap:16rpx; }.price-row .price { font-size:48rpx; }.price-row>text:nth-child(2) { color:#999; text-decoration:line-through; font-size:23rpx; }.sales { margin-left:auto; color:#999; font-size:22rpx; }.title { display:block; margin-top:22rpx; font-size:34rpx; font-weight:700; }.subtitle { display:block; margin-top:10rpx; color:#777; font-size:24rpx; }.panel { display:flex; align-items:center; gap:30rpx; }.label { width:70rpx; color:#777; font-size:24rpx; }.options { display:flex; flex-wrap:wrap; gap:16rpx; }.options text { padding:14rpx 24rpx; background:#f2f3f5; border:2rpx solid transparent; font-size:24rpx; }.options .active { color:#e94335; border-color:#e94335; background:#fff6f5; }.quantity { justify-content:space-between; }.stepper { display:flex; }.stepper text { width:70rpx; height:58rpx; line-height:58rpx; text-align:center; background:#f2f3f5; border-right:2rpx solid #fff; }.service-panel { display:flex; justify-content:space-between; color:#727780; font-size:21rpx; }.service-panel text::before { content:'✓'; color:#e94335; margin-right:8rpx; }.detail-copy>text { display:block; }.detail-copy>text:first-child { font-size:30rpx; font-weight:700; }.detail-copy>text:last-child { margin-top:22rpx; color:#73777e; font-size:24rpx; line-height:1.7; }
.action { position:fixed; z-index:20; left:0; right:0; bottom:0; min-height:110rpx; padding:12rpx 20rpx; display:flex; align-items:center; gap:12rpx; background:#fff; border-top:1rpx solid #eee; }.action>view { position:relative; width:82rpx; text-align:center; font-size:20rpx; }.action>view>text { display:block; }.action>view>text:first-child { font-size:34rpx; }.action button { flex:1; height:80rpx; line-height:80rpx; border-radius:4rpx; font-size:27rpx; }.cart-btn { background:#202124; color:#fff; }.buy-btn { background:#e94335; color:#fff; }.cart-count { position:absolute; top:-6rpx; right:5rpx; color:#e94335; font-weight:700; }.action button::after { border:0; }
</style>
