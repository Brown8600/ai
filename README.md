# 星选商城

一个面向微信小程序的全栈商城示例项目，包含用户端小程序、Fastify + PostgreSQL API、浏览器管理后台，以及可在 Ubuntu 虚拟机上运行的 Docker Compose 部署方案。

## 功能概览

- 微信小程序商城：商品浏览、分类、商品详情、购物车、地址、下单、订单查询和个人中心
- 用户认证：开发环境登录、JWT 访问令牌和刷新令牌
- 商品域：分类、商品、SKU、价格、原价、库存、销量和启用状态
- 订单域：创建订单、支付状态、订单详情、取消和发货信息
- 管理后台：管理员登录、经营概览、分类管理、商品与 SKU/库存管理、订单发货、用户查询
- 权限管理：`SUPER_ADMIN` 和 `OPERATOR` 两种管理员角色
- 安全审计：管理员登录、商品/分类/订单/账号操作写入审计日志
- 演示数据：分类、商品、SKU、用户和多种订单状态的可重复 Seed 脚本
- VM 部署：API、PostgreSQL、管理后台三个容器，数据库使用持久化 Docker volume

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 小程序 | uni-app、Vue 3、Pinia、Vite、TypeScript |
| API | Node.js 22、Fastify 5、TypeScript、Zod |
| 数据库 | PostgreSQL 16、SQL migration |
| 认证 | JWT（`jose`）、管理员密码 scrypt 哈希 |
| 管理后台 | 原生 HTML/CSS/JavaScript、Nginx |
| 部署 | Docker、Docker Compose、Ubuntu |
| 测试 | Node test runner、TypeScript 编译和前端类型检查 |

## 项目结构

```text
.
├─ src/                    # uni-app 微信小程序源码
├─ server/                 # Fastify API、迁移、Seed 和测试
├─ admin-web/              # 浏览器管理后台静态页面和 Nginx 配置
├─ deploy/                 # Ubuntu/VM Docker Compose 和部署脚本
├─ release/                # VM 发布包
├─ .env.development        # 小程序开发环境变量
├─ .env.production.example # 小程序生产环境变量模板
└─ package.json            # 根项目脚本
```

## 环境要求

- Node.js 22+
- pnpm 9+（项目通过 Corepack 管理也可以）
- Docker Engine + Docker Compose Plugin（本地 API 或 VM 部署需要）
- 微信开发者工具（运行小程序需要）
- Ubuntu 22.04/24.04（部署到 VM 时）

首次安装依赖：

```powershell
corepack enable
pnpm install
```

## 本地启动 API

先启动本地 PostgreSQL：

```powershell
Copy-Item server/.env.example server/.env
docker compose -f server/docker-compose.dev.yml up -d
```

确认 `server/.env` 至少包含：

```env
NODE_ENV=development
DATABASE_URL=postgres://xingxuan:xingxuan_dev_password@127.0.0.1:5432/xingxuan
JWT_SECRET=local_development_secret_at_least_32_chars
ALLOW_DEV_LOGIN=true
```

执行迁移、演示数据并启动 API：

```powershell
pnpm server:migrate
pnpm server:seed
pnpm server:dev
```

API 默认地址：

```text
健康检查：http://127.0.0.1:3000/health
API 根路径：http://127.0.0.1:3000/api/v1
```

## 启动微信小程序

在项目根目录执行：

```powershell
pnpm dev:mp-weixin
```

编译目录为：

```text
dist/dev/mp-weixin
```

用微信开发者工具导入该目录。开发者工具中可勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”，以便访问局域网 API。

开发环境 API 地址由 `.env.development` 控制：

```env
VITE_API_BASE_URL=http://192.168.199.128:3000/api/v1
```

真机或正式版不能依赖局域网 HTTP 地址，需要使用 HTTPS 域名，并在微信公众平台配置 request、图片和下载文件合法域名。

## 启动浏览器管理后台

生产 VM 部署后访问：

```text
http://虚拟机IP:8080
```

管理员登录接口：

```text
POST /api/v1/admin/auth/login
```

请求体：

```json
{
  "username": "admin",
  "password": "部署时生成的管理员密码"
}
```

登录成功后，后台会将 `accessToken` 保存在当前浏览器会话，并用 Bearer Token 调用管理接口。

## Ubuntu VM 部署

### 首次准备

将项目发布包上传到 VM，例如 `/opt/xingxuan-mall`。未安装 Docker 时执行：

```bash
cd /opt/xingxuan-mall/deploy
sudo bash bootstrap-docker-ubuntu.sh
```

### 部署或升级

```bash
cd /opt/xingxuan-mall/deploy
chmod +x deploy-vm.sh
./deploy-vm.sh
```

脚本会：

1. 构建 API 和管理后台镜像
2. 启动或等待 PostgreSQL 健康
3. 执行数据库 migration
4. 按 `SEED_ON_DEPLOY` 决定是否写入演示数据
5. 创建首个管理员（不会覆盖已存在管理员密码）
6. 启动 API（3000）和后台（8080）
7. 检查 API 健康接口和后台首页

默认服务：

```text
API：http://虚拟机IP:3000
后台：http://虚拟机IP:8080
健康检查：http://虚拟机IP:3000/health
```

部署配置保存在 `deploy/.env.vm`，该文件包含数据库密码、JWT 密钥和管理员密码，已被 Git 忽略。首次部署后请读取并安全保存管理员密码：

```bash
grep '^ADMIN_SEED_' /opt/xingxuan-mall/deploy/.env.vm
```

生产环境建议确认：

```env
SEED_ON_DEPLOY=false
```

这样后续升级不会重写线上商品、订单或用户数据。严禁执行 `docker compose down -v`，否则会删除 PostgreSQL 数据卷。

## 服务启动、停止和查看

所有命令在 VM 的 `/opt/xingxuan-mall/deploy` 目录执行：

```bash
# 查看状态
docker compose --env-file .env.vm -f docker-compose.vm.yml ps

# 启动全部服务
docker compose --env-file .env.vm -f docker-compose.vm.yml up -d

# 停止容器但保留数据卷
docker compose --env-file .env.vm -f docker-compose.vm.yml stop

# 重新启动
docker compose --env-file .env.vm -f docker-compose.vm.yml restart

# 查看日志
docker compose --env-file .env.vm -f docker-compose.vm.yml logs -f --tail=200 api admin-web

# 只重启后台页面
docker compose --env-file .env.vm -f docker-compose.vm.yml restart admin-web
```

不要使用：

```bash
docker compose down -v
```

`-v` 会删除 PostgreSQL 持久化卷。

## 数据库备份

部署目录提供备份脚本：

```bash
cd /opt/xingxuan-mall/deploy
chmod +x backup.sh
./backup.sh
```

备份文件应同步到 VM 之外的可靠存储。恢复前先停止 API 写入，再使用 PostgreSQL 官方 `pg_restore` 或 `psql` 工具恢复。

## 常用 API

公开接口：

```text
GET /health
GET /api/v1/categories
GET /api/v1/products?page=1&pageSize=20
```

管理员接口需要 `Authorization: Bearer <accessToken>`：

```text
GET   /api/v1/admin/dashboard
GET   /api/v1/admin/categories
POST  /api/v1/admin/categories
GET   /api/v1/admin/products
POST  /api/v1/admin/products
PATCH /api/v1/admin/skus/:id
GET   /api/v1/admin/orders
POST  /api/v1/admin/orders/:id/ship
GET   /api/v1/admin/users
GET   /api/v1/admin/super/accounts
GET   /api/v1/admin/super/audit-logs
```

完整接口约定见 [server/API.md](server/API.md)。

## 测试与构建

```powershell
# API 测试
pnpm --dir server test

# API TypeScript 构建
pnpm server:build

# 小程序类型检查
pnpm type-check

# 构建微信小程序
pnpm build:mp-weixin
```

VM API Docker 构建使用：

```dockerfile
RUN pnpm install --frozen-lockfile --ignore-scripts
```

这是为了兼容 VM 上 pnpm 对 `esbuild` 构建脚本审批的限制；API 生产镜像运行已编译 JavaScript，不依赖安装阶段的 esbuild 脚本。

## 常见问题

### 管理员登录返回 `ROUTE_NOT_FOUND`

确认使用完整路径和 POST 方法：

```text
POST http://虚拟机IP:3000/api/v1/admin/auth/login
```

### 管理员登录返回 400

Postman Body 选择 `raw` → `JSON`，请求体包含用户名和长度至少 12 的密码。

### 商品图片无法加载

商品图片 URL 必须真实可访问。外链图片可能失效、被防盗链拦截；微信真机还要求图片域名已配置为合法域名。生产环境建议使用自有 HTTPS CDN 或对象存储。

### 小程序请求失败

检查 `.env.development` 的 API 地址、VM 防火墙端口和微信开发者工具的“不校验合法域名”选项。真机不能使用 `127.0.0.1`。

### 部署构建失败

查看日志：

```bash
tail -n 100 /tmp/xingxuan-build.log
docker compose --env-file .env.vm -f docker-compose.vm.yml logs --tail=200 api admin-web
```

如果是 npm registry 超时，确认 VM 能访问外网后重新执行 `./deploy-vm.sh`。不要删除数据库卷来解决镜像构建问题。

## 安全注意事项

- 不要提交 `.env.vm`、数据库密码、`JWT_SECRET`、微信 AppSecret 或支付私钥
- 首次部署生成的管理员密码只保存到密码管理器，不要写入 README
- 生产环境只开放必要端口，不要对公网开放 PostgreSQL 5432
- 管理后台当前为局域网 HTTP 方案，公网环境应放在 HTTPS 反向代理之后
- 定期备份数据库和审计日志，并监控 API 5xx、磁盘空间和支付回调失败

