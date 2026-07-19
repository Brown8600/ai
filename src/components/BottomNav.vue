<script setup lang="ts">
import { useCartStore } from '@/stores/cart'

// current 由页面传入，用于高亮当前栏目，避免组件读取路由产生平台差异。
defineProps<{ current: string }>()
const cart = useCartStore()

// 自定义导航替代原生 tabBar，便于显示实时购物车数量并统一视觉样式。
const tabs = [
  { key: 'home', label: '首页', icon: '⌂', url: '/pages/home/index' },
  { key: 'category', label: '分类', icon: '▦', url: '/pages/category/index' },
  { key: 'cart', label: '购物车', icon: '▱', url: '/pages/cart/index' },
  { key: 'profile', label: '我的', icon: '○', url: '/pages/profile/index' }
]
// 主栏目之间使用 reLaunch，清理中间页面栈，避免连续切换后返回层级过深。
function go(url: string) { uni.reLaunch({ url }) }
</script>

<template>
  <!-- 固定在安全区上方的商城主导航 -->
  <view class="nav safe-bottom">
    <view v-for="tab in tabs" :key="tab.key" class="nav-item" :class="{ active: current === tab.key }" @tap="go(tab.url)">
      <view class="icon">{{ tab.icon }}<text v-if="tab.key === 'cart' && cart.count" class="badge">{{ cart.count }}</text></view>
      <text>{{ tab.label }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.nav { position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; height: 108rpx; display: flex; background: rgba(255,255,255,.97); border-top: 1rpx solid #e9eaec; }
.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5rpx; color: #777b82; font-size: 22rpx; }
.icon { position: relative; height: 38rpx; font-size: 36rpx; line-height: 36rpx; }
.active { color: #e94335; font-weight: 600; }
.badge { position: absolute; top: -12rpx; right: -24rpx; min-width: 30rpx; height: 30rpx; padding: 0 6rpx; border-radius: 15rpx; background: #e94335; color: #fff; font-size: 18rpx; text-align: center; line-height: 30rpx; }
</style>
