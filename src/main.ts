import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/global.scss'

/**
 * UniApp 应用入口。
 * createSSRApp 是 UniApp Vue 3 项目的标准初始化方式，编译器会针对
 * 微信小程序、H5 等目标平台生成各自的启动代码。
 */
export function createApp() {
  const app = createSSRApp(App)

  // Pinia 注册后，页面和组件可通过 useXxxStore() 共享购物车等业务状态。
  app.use(createPinia())
  return { app }
}
