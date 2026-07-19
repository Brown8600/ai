<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import BottomNav from '@/components/BottomNav.vue'
import ProductCard from '@/components/ProductCard.vue'
import { catalogApi } from '@/api'
import type { Product } from '@/types'

// 搜索词与输入框双向绑定；首期用 Toast 模拟搜索反馈。
const keyword = ref('')
const categories = ref<Array<{ id: string; name: string }>>([])
const products = ref<Product[]>([])
const loading = ref(false)

async function loadHome() {
  loading.value = true
  try {
    const [categoryResult, productResult] = await Promise.all([
      catalogApi.categories(),
      catalogApi.products({ keyword: keyword.value, pageSize: 20 })
    ])
    categories.value = categoryResult
    products.value = productResult.items
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function search() { void loadHome() }

// 分类 ID 通过 URL 传递，使分类页打开时能直接定位到服务端栏目。
function goCategory(categoryId = categories.value[0]?.id) {
  if (categoryId) uni.navigateTo({ url: `/pages/category/index?categoryId=${categoryId}` })
}

onLoad(() => { void loadHome() })
onPullDownRefresh(() => { void loadHome() })
</script>

<template>
  <view class="page home">
    <!-- 自定义标题栏与搜索入口 -->
    <view class="top"><view class="brand">星选<text>MALL</text></view><view class="search"><text>⌕</text><input v-model="keyword" placeholder="搜索好物" confirm-type="search" @confirm="search" /></view></view>
    <!-- 首屏活动主视觉 -->
    <view class="hero">
      <text class="kicker">WEEKLY SELECT</text><text class="headline">让日常生活，\n多一点好选择</text><text class="hero-copy">本周精选好物 · 限时直降</text>
      <button @tap="goCategory()">立即选购</button>
    </view>
    <!-- 高频分类快捷入口 -->
    <view class="category-row">
      <view v-for="(item,index) in categories" :key="item.id" @tap="goCategory(item.id)"><view class="category-icon">{{ ['⌁','⌂','✦','♢','◉'][index] }}</view><text>{{ item.name }}</text></view>
    </view>
    <view class="service"><text>正品保障</text><text>七天无理由</text><text>极速发货</text></view>
    <view class="section-title"><text>本周精选</text><text class="muted" @tap="goCategory()">查看全部 ›</text></view>
    <!-- 服务端返回的商品列表 -->
    <view class="product-grid"><ProductCard v-for="item in products" :key="item.id" :product="item" /></view>
    <view v-if="loading" class="loading">正在加载商品...</view>
    <BottomNav current="home" />
  </view>
</template>

<style scoped lang="scss">
.home { background: #f5f6f8; }
.top { padding: calc(var(--status-bar-height) + 18rpx) 28rpx 20rpx; display: flex; gap: 28rpx; align-items: center; background: #fff; }
.brand { font-size: 38rpx; font-weight: 900; letter-spacing: 1rpx; white-space: nowrap; }.brand text { color: #e94335; font-size: 19rpx; margin-left: 4rpx; }
.search { flex: 1; height: 70rpx; padding: 0 22rpx; display: flex; align-items: center; gap: 12rpx; background: #f0f1f3; border-radius: 6rpx; color: #777; }.search input { flex: 1; font-size: 26rpx; }
.hero { height: 400rpx; margin: 0 28rpx; padding: 50rpx 40rpx; color: #fff; background: linear-gradient(115deg,#16191f 0%,#292f39 60%,#45576a 100%); position: relative; overflow: hidden; }.hero::after { content:''; position:absolute; right:-80rpx; bottom:-120rpx; width:360rpx; height:360rpx; border:54rpx solid rgba(255,255,255,.08); border-radius:50%; }
.kicker,.headline,.hero-copy { display:block; position:relative; z-index:1; }.kicker { color:#ff766b; font-size:20rpx; font-weight:700; }.headline { margin-top:28rpx; font-size:48rpx; line-height:1.25; font-weight:800; }.hero-copy { margin-top:22rpx; color:#cfd4da; font-size:23rpx; }.hero button { position:absolute; z-index:2; bottom:38rpx; left:40rpx; margin:0; width:180rpx; height:60rpx; line-height:60rpx; background:#fff; color:#202124; font-size:24rpx; border-radius:3rpx; }
.category-row { margin-top:20rpx; padding:30rpx 22rpx; display:flex; justify-content:space-around; background:#fff; }.category-row>view { width:110rpx; text-align:center; font-size:23rpx; }.category-icon { width:76rpx; height:76rpx; margin:0 auto 13rpx; line-height:76rpx; background:#f2f3f5; border-radius:50%; font-size:30rpx; }
.service { margin-top:2rpx; padding:20rpx 36rpx; display:flex; justify-content:space-between; background:#fff; color:#747982; font-size:21rpx; }.service text::before { content:'✓'; color:#e94335; margin-right:8rpx; }
.section-title .muted { font-size:23rpx; font-weight:400; }.product-grid { padding:0 24rpx; display:grid; grid-template-columns:1fr 1fr; gap:18rpx; }
.loading { padding:40rpx; text-align:center; color:#858a92; font-size:23rpx; }
</style>
