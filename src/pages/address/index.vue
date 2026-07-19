<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { commerceApi, ensureAuthenticated } from '@/api'
import type { Address } from '@/types'

const addresses = ref<Address[]>([])
const saving = ref(false)
const form = reactive<Omit<Address, 'id'>>({
  name: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: true
})

async function load() {
  await ensureAuthenticated()
  addresses.value = await commerceApi.addresses()
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    await commerceApi.addAddress({ ...form })
    Object.assign(form, { name: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: false })
    await load()
    uni.showToast({ title: '地址已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function setDefault(id: string) {
  await commerceApi.setDefaultAddress(id)
  await load()
}

function changeDefault(event: Event) {
  form.isDefault = (event as unknown as { detail: { value: boolean } }).detail.value
}

onShow(() => { load().catch(error => uni.showToast({ title: error instanceof Error ? error.message : '地址加载失败', icon: 'none' })) })
</script>

<template>
  <view class="address-page">
    <view class="form">
      <text class="title">新增收货地址</text>
      <input v-model="form.name" maxlength="40" placeholder="收货人姓名" />
      <input v-model="form.phone" type="number" maxlength="11" placeholder="手机号码" />
      <view class="region"><input v-model="form.province" placeholder="省份" /><input v-model="form.city" placeholder="城市" /><input v-model="form.district" placeholder="区县" /></view>
      <textarea v-model="form.detail" maxlength="160" placeholder="详细地址：街道、门牌号等" />
      <view class="default-row"><text>设为默认地址</text><switch :checked="form.isDefault" color="#e94335" @change="changeDefault" /></view>
      <button :loading="saving" class="primary-button" @tap="submit">保存地址</button>
    </view>

    <view class="section-title"><text>我的地址</text><text class="muted">{{ addresses.length }} 条</text></view>
    <view v-for="item in addresses" :key="item.id" class="address-card" @tap="setDefault(item.id)">
      <view><text class="name">{{ item.name }}　{{ item.phone }}</text><text class="detail">{{ item.province }}{{ item.city }}{{ item.district }}{{ item.detail }}</text></view>
      <text v-if="item.isDefault" class="default-tag">默认</text><text v-else class="set-default">设为默认</text>
    </view>
    <view v-if="!addresses.length" class="empty">还没有收货地址</view>
  </view>
</template>

<style scoped lang="scss">
.address-page { min-height:100vh; padding:20rpx 24rpx 60rpx; }.form { padding:28rpx; background:#fff; }.title { display:block; margin-bottom:22rpx; font-size:30rpx; font-weight:700; }.form input,.form textarea { width:100%; min-height:86rpx; padding:20rpx 0; border-bottom:1rpx solid #e7e8ea; font-size:25rpx; }.form textarea { height:120rpx; }.region { display:flex; gap:20rpx; }.region input { flex:1; min-width:0; }.default-row { height:90rpx; display:flex; justify-content:space-between; align-items:center; font-size:24rpx; }.form button { margin-top:15rpx; height:80rpx; line-height:80rpx; }.section-title { padding-left:4rpx; padding-right:4rpx; }.section-title .muted { font-size:21rpx; font-weight:400; }.address-card { margin-bottom:16rpx; padding:28rpx; display:flex; align-items:center; gap:22rpx; background:#fff; }.address-card>view { flex:1; }.name,.detail { display:block; }.name { font-size:27rpx; font-weight:650; }.detail { margin-top:14rpx; color:#70757d; font-size:23rpx; line-height:1.5; }.default-tag,.set-default { padding:7rpx 12rpx; font-size:20rpx; }.default-tag { color:#e94335; background:#fff0ee; }.set-default { color:#8b8f96; }
</style>
