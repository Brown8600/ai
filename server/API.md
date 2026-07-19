# 星选商城 API

基础路径：`/api/v1`。除商品目录、登录和支付回调外，接口需要：

```http
Authorization: Bearer <accessToken>
```

所有 ID 均为 UUID 字符串，金额字段均为整数分。成功响应为 `{ "data": ... }`；错误响应为：

```json
{ "code": "VALIDATION_ERROR", "message": "Request validation failed", "requestId": "...", "details": {} }
```

## 登录

- `POST /auth/wechat`：`{ "code": "wx.login 返回的临时 code" }`
- `POST /auth/refresh`：`{ "refreshToken": "..." }`
- `POST /auth/logout`：撤销刷新令牌
- `GET /me`：当前用户

开发环境在 `ALLOW_DEV_LOGIN=true` 时接受 `dev-*` code；生产配置会强制拒绝开启该模式。

## 商品

- `GET /categories`
- `GET /products?categoryId=&keyword=&sort=default|sales|price&page=1&pageSize=20`
- `GET /products/:id`

商品详情返回 `skus[]`，每项包含 `id/specification/priceCents/originalPriceCents/stock`。

## 购物车

- `GET /cart`
- `POST /cart/items`：`{ "skuId": "uuid", "quantity": 1 }`
- `PATCH /cart/items/:id`：`{ "quantity": 2 }`
- `DELETE /cart/items/:id`

## 地址

- `GET /addresses`
- `POST /addresses`
- `PATCH /addresses/:id`
- `DELETE /addresses/:id`
- `PUT /addresses/:id/default`

地址只能访问当前登录用户的数据，手机号和字段长度会在服务端校验。

## 报价与订单

先获取 10 分钟有效的服务端报价：

```http
POST /checkout/quote
Content-Type: application/json

{
  "items": [{ "skuId": "uuid", "quantity": 1 }],
  "addressId": "uuid"
}
```

再创建订单：

```http
POST /orders
Idempotency-Key: <每次结算生成并在重试中复用的唯一键>

{ "quoteToken": "uuid", "remark": "尽快发货" }
```

服务端会重新锁定 SKU、检查价格和库存，并在同一数据库事务中扣减库存和创建订单。客户端提交的价格、运费、用户 ID 或订单状态不会被接受。

- `GET /orders?status=PENDING_PAYMENT`
- `GET /orders/:id`
- `POST /orders/:id/cancel`
- `POST /orders/:id/confirm-receipt`

状态主链路：`PENDING_PAYMENT -> PAID -> SHIPPED -> COMPLETED`；待付款订单可转为 `CANCELLED` 并归还库存。

## 微信支付

- `POST /orders/:id/payments/wechat`：返回 `uni.requestPayment` 所需参数
- `POST /payments/wechat/notify`：微信支付 API v3 公网回调

支付回调会验证时间窗口、平台证书序列号、RSA 签名、AppID、商户号、订单号、金额和币种，再解密资源并按事件 ID 去重。客户端支付成功回调只用于界面反馈，订单支付状态以服务端通知为准。

## 后台管理

管理员使用独立账号登录，不能使用小程序用户令牌访问管理接口：

- `POST /admin/auth/login`：`{ "username": "admin", "password": "..." }`
- `GET /admin/auth/me`
- `GET /admin/dashboard`
- `GET/POST/PATCH /admin/categories`、`/admin/categories/:id`
- `GET/POST/PATCH /admin/products`、`/admin/products/:id`
- `PATCH /admin/skus/:id`：更新价格、库存或启用状态
- `GET /admin/orders`、`GET /admin/orders/:id`
- `POST /admin/orders/:id/ship`：`{ "carrier": "顺丰速运", "trackingNo": "SF..." }`
- `GET /admin/users`

超级管理员额外拥有 `/admin/super/accounts` 和 `/admin/super/audit-logs`。首次管理员由 `ADMIN_SEED_USERNAME`、`ADMIN_SEED_PASSWORD` 和 `ADMIN_SEED_DISPLAY_NAME` 创建；已有部署可执行 `pnpm admin:create`（容器内为 `node dist/scripts/create-admin.js`）。密码只保存为 scrypt 哈希，Seed 不会覆盖已存在管理员的密码。
