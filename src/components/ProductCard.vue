<script setup lang="ts">
import type { Product } from '@/types'
import { formatMoney, lowestPriceCents } from '@/utils/money'

// 商品卡只负责展示与进入详情，业务数据由父页面提供。
defineProps<{ product: Product }>()

// 将商品 id 作为查询参数传给详情页，详情页再从数据层查询完整商品。
function open(id: string) { uni.navigateTo({ url: `/pages/product/detail?id=${id}` }) }
</script>

<template>
  <!-- 首页和分类页共用的标准商品卡片 -->
  <view class="card" @tap="open(product.id)">
    <view class="media"><image :src="product.image" mode="aspectFill" /><text v-if="product.badge" class="tag">{{ product.badge }}</text></view>
    <view class="content">
      <text class="name">{{ product.name }}</text>
      <text class="subtitle">{{ product.subtitle }}</text>
      <view class="meta"><text class="price">{{ formatMoney(lowestPriceCents(product)) }}</text><text>已售 {{ product.sales }}</text></view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.card { overflow: hidden; background: #fff; border-radius: 8rpx; }
.media { position: relative; aspect-ratio: 1 / 1; background: #eceef1; }
.media image { width: 100%; height: 100%; }
.tag { position: absolute; left: 14rpx; top: 14rpx; padding: 6rpx 12rpx; background: #202124; color: #fff; font-size: 20rpx; }
.content { padding: 18rpx; }
.name, .subtitle { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.name { font-size: 27rpx; font-weight: 650; }
.subtitle { margin-top: 8rpx; color: #858a92; font-size: 22rpx; }
.meta { margin-top: 18rpx; display: flex; justify-content: space-between; align-items: flex-end; color: #9a9ea5; font-size: 20rpx; }
.price { font-size: 32rpx; }
</style>
