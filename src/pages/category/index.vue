<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import BottomNav from '@/components/BottomNav.vue'
import ProductCard from '@/components/ProductCard.vue'
import { catalogApi } from '@/api'
import type { Product } from '@/types'

// active 控制左侧分类，sort 控制右侧商品的当前排序规则。
const active = ref(0)
const sort = ref<'default'|'sales'|'price'>('default')
const categories = ref<Array<{ id: string; name: string }>>([])
const list = ref<Product[]>([])
const loading = ref(false)

// 首页点击分类时会携带 categoryId；直接打开页面则默认展示第一个分类。
onLoad(async query => {
  const requestedCategoryId = String(query?.categoryId || '')
  try {
    categories.value = await catalogApi.categories()
    const requestedIndex = categories.value.findIndex(item => item.id === requestedCategoryId)
    active.value = requestedIndex >= 0 ? requestedIndex : 0
    await loadProducts()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
  }
})

/** 根据当前分类和排序条件重新请求服务端商品列表。 */
async function loadProducts() {
  const category = categories.value[active.value]
  if (!category) return
  loading.value = true
  try {
    list.value = (await catalogApi.products({ categoryId: category.id, sort: sort.value, pageSize: 50 })).items
  } finally {
    loading.value = false
  }
}

function selectCategory(index: number) {
  active.value = index
  void loadProducts()
}

function selectSort(value: 'default'|'sales'|'price') {
  sort.value = value
  void loadProducts()
}
</script>

<template>
  <view class="page category-page">
    <!-- 商品排序控制 -->
    <view class="filter"><text :class="{active:sort==='default'}" @tap="selectSort('default')">综合</text><text :class="{active:sort==='sales'}" @tap="selectSort('sales')">销量</text><text :class="{active:sort==='price'}" @tap="selectSort('price')">价格 ↑</text></view>
    <!-- 左侧分类导航与右侧独立滚动商品区 -->
    <view class="body"><scroll-view scroll-y class="sidebar"><view v-for="(item,index) in categories" :key="item.id" :class="{active:index===active}" @tap="selectCategory(index)">{{ item.name }}</view></scroll-view>
      <scroll-view scroll-y class="content"><view class="category-head"><text>{{ categories[active]?.name || '' }}</text><text>精选 {{ list.length }} 件商品</text></view><view class="grid"><ProductCard v-for="item in list" :key="item.id" :product="item" /></view><view v-if="!loading && !list.length" class="empty">该分类暂无商品</view><view v-if="loading" class="empty">正在加载...</view></scroll-view>
    </view><BottomNav current="category" />
  </view>
</template>

<style scoped lang="scss">
.category-page { background:#fff; }.filter { height:88rpx; display:flex; justify-content:flex-end; gap:46rpx; align-items:center; padding:0 30rpx; border-bottom:1rpx solid #eee; font-size:25rpx; }.filter .active { color:#e94335; font-weight:700; }
.body { display:flex; height:calc(100vh - 196rpx - env(safe-area-inset-bottom)); }.sidebar { width:170rpx; height:100%; background:#f5f6f8; }.sidebar view { height:100rpx; line-height:100rpx; padding-left:34rpx; font-size:26rpx; border-left:6rpx solid transparent; }.sidebar .active { background:#fff; border-color:#e94335; font-weight:700; color:#e94335; }
.content { flex:1; height:100%; padding:28rpx 24rpx; }.category-head { margin-bottom:24rpx; display:flex; justify-content:space-between; align-items:baseline; }.category-head text:first-child { font-size:34rpx; font-weight:700; }.category-head text:last-child { color:#8a8e95; font-size:21rpx; }.grid { display:grid; grid-template-columns:1fr 1fr; gap:16rpx; }
</style>
