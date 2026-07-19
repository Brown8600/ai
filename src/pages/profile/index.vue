<script setup lang="ts">
import { ref } from 'vue'
import BottomNav from '@/components/BottomNav.vue'
import { ensureAuthenticated } from '@/api'

// 首期使用页面内状态模拟微信登录；接入后应由用户 Store 持久化 token 和资料。
const loggedIn = ref(Boolean(uni.getStorageSync('xingxuan.accessToken')))

// 模拟授权成功后的 UI 切换，不请求真实微信用户信息。
async function login() {
  try {
    await ensureAuthenticated()
    loggedIn.value = true
    uni.showToast({title:'登录成功',icon:'success'})
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' })
  }
}

// 多个订单入口统一复用同一导航函数。
function goOrders() { uni.navigateTo({ url: '/pages/order/index' }) }

// 个人中心功能入口配置化，方便后续为每项补充 url 和权限要求。
const menus = ['收货地址','我的收藏','优惠券','浏览记录','客服与帮助','设置']

function openMenu(index: number) {
  if (index === 0) uni.navigateTo({ url: '/pages/address/index' })
  else uni.showToast({ title: '功能正在建设中', icon: 'none' })
}
</script>

<template><view class="page profile-page">
  <!-- 用户概览与微信登录入口 -->
  <view class="profile-head"><view class="avatar">{{ loggedIn?'星':'○' }}</view><view><text>{{ loggedIn?'星选用户':'登录 / 注册' }}</text><text>{{ loggedIn?'欢迎回来，发现今日好物':'登录后查看订单和优惠' }}</text></view><button v-if="!loggedIn" @tap="login">微信登录</button></view>
  <!-- 订单状态快捷入口 -->
  <view class="order-card"><view class="card-head"><text>我的订单</text><text @tap="goOrders">全部订单 ›</text></view><view class="order-types"><view v-for="item in ['待付款','待发货','待收货','售后']" :key="item" @tap="goOrders"><text>{{ {'待付款':'¥','待发货':'□','待收货':'▤','售后':'↺'}[item] }}</text><text>{{ item }}</text></view></view></view>
  <view class="stats"><view><text>0</text><text>收藏</text></view><view><text>2</text><text>优惠券</text></view><view><text>128</text><text>积分</text></view></view>
  <!-- 常用账户服务菜单 -->
  <view class="menu"><view v-for="(item,index) in menus" :key="item" @tap="openMenu(index)"><text>{{ ['⌖','♡','◇','◷','?','⚙'][index] }}</text><text>{{ item }}</text><text>›</text></view></view>
  <BottomNav current="profile" />
</view></template>

<style scoped lang="scss">
.profile-head { min-height:280rpx; padding:70rpx 35rpx 55rpx; display:flex; align-items:center; gap:24rpx; background:#202124; color:#fff; }.avatar { width:112rpx; height:112rpx; line-height:112rpx; text-align:center; background:#fff; color:#202124; border-radius:50%; font-size:45rpx; font-weight:800; }.profile-head>view:nth-child(2) { flex:1; }.profile-head text { display:block; }.profile-head view text:first-child { font-size:34rpx; font-weight:700; }.profile-head view text:last-child { margin-top:13rpx; color:#bfc2c7; font-size:22rpx; }.profile-head button { margin:0; padding:0 20rpx; height:60rpx; line-height:60rpx; background:#e94335; color:#fff; border-radius:3rpx; font-size:22rpx; }.order-card,.stats,.menu { margin:20rpx 24rpx; background:#fff; }.card-head { padding:26rpx; display:flex; justify-content:space-between; border-bottom:1rpx solid #eee; }.card-head text:first-child { font-size:28rpx; font-weight:700; }.card-head text:last-child { color:#888; font-size:22rpx; }.order-types { padding:30rpx 15rpx; display:flex; }.order-types view { flex:1; text-align:center; font-size:22rpx; }.order-types text { display:block; }.order-types text:first-child { height:55rpx; font-size:38rpx; }.stats { padding:25rpx 0; display:flex; }.stats view { flex:1; text-align:center; border-right:1rpx solid #eee; }.stats view:last-child { border:0; }.stats text { display:block; }.stats text:first-child { font-size:30rpx; font-weight:700; }.stats text:last-child { margin-top:8rpx; color:#888; font-size:21rpx; }.menu { padding:0 26rpx; }.menu view { height:92rpx; display:flex; align-items:center; border-bottom:1rpx solid #eee; font-size:25rpx; }.menu view text:first-child { width:60rpx; color:#e94335; font-size:30rpx; }.menu view text:nth-child(2) { flex:1; }.menu view text:last-child { color:#aaa; font-size:32rpx; }
</style>
