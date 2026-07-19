# 星选商城 Ubuntu 部署

## 内网虚拟机联调

没有域名和 HTTPS 时，先使用 `deploy/docker-compose.vm.yml`。它只在虚拟机上启动 PostgreSQL 与 API，并公开 `3000` 端口：

```bash
cd /opt/xingxuan-mall/deploy
chmod +x deploy-vm.sh
./deploy-vm.sh
curl http://127.0.0.1:3000/health
```

当前小程序开发环境指向 `http://192.168.199.128:3000/api/v1`。此模式只能用于局域网和微信开发者工具调试，不能提交为正式小程序版本。

`deploy-vm.sh` 首次运行会自动生成随机数据库密码和 JWT 密钥到权限为 `600` 的 `.env.vm`。如果 Ubuntu 尚未安装 Docker，先运行 `sudo bash bootstrap-docker-ubuntu.sh`，然后重新连接 SSH 会话。

脚本也会生成 `admin` 超级管理员。首次部署后执行 `grep '^ADMIN_SEED_' .env.vm` 读取一次账号密码，并立即保存到密码管理器；后续部署不会覆盖已经存在的管理员密码。

## 1. 服务器前提

- Ubuntu 22.04/24.04，安装 Docker Engine 与 Compose Plugin。
- API 域名已经解析到服务器公网 IP；中国大陆服务器通常还需要备案。
- UFW 只开放 `22/tcp`、`80/tcp`、`443/tcp`，不要开放 PostgreSQL 端口。
- 使用 Certbot 申请证书，证书位于 `/etc/letsencrypt/live/<API_DOMAIN>/`。

## 2. 配置

```bash
cd /opt/xingxuan-mall/deploy
cp .env.example .env
mkdir -p secrets
```

编辑 `.env`，填入数据库强密码、JWT 随机密钥、微信小程序 AppID/AppSecret 及微信支付参数。把商户私钥与微信支付平台证书放到：

```text
deploy/secrets/wechat_mch_private_key.pem
deploy/secrets/wechat_platform_cert.pem
```

私钥和 `.env` 不应提交到 Git。部署脚本会把密钥权限设置为 `600`。

## 3. 首次部署与更新

```bash
chmod +x deploy.sh backup.sh
./deploy.sh
```

脚本会构建 API、执行数据库迁移、启动 PostgreSQL/API/Nginx，并检查 `/health`。首次部署演示商品时将 `SEED_ON_DEPLOY=true`；种子成功后改回 `false`，后续发布不会修改线上商品或库存。

更新代码后重新执行 `./deploy.sh`。发布前建议先执行 `./backup.sh`，并定期将备份同步到服务器外部存储。

### 管理员初始化

已有 VM 没有管理员配置时，更新发布包后执行：

```bash
cd /opt/xingxuan-mall/deploy
./deploy-vm.sh
grep '^ADMIN_SEED_' .env.vm
```

管理登录接口为 `POST /api/v1/admin/auth/login`。管理数据、商品库存、订单发货和用户查询位于 `/api/v1/admin/*`；创建其他管理员和查看审计日志需要超级管理员令牌，路径为 `/api/v1/admin/super/*`。

## 4. 微信平台配置

1. 把 `src/manifest.json` 中的 `mp-weixin.appid` 改为真实 AppID。
2. 在微信公众平台配置 `https://<API_DOMAIN>` 为 request 合法域名。
3. 将商品图片迁移到自有 HTTPS CDN，并配置对应图片/downloadFile 合法域名。
4. 微信支付回调设置为 `https://<API_DOMAIN>/api/v1/payments/wechat/notify`。
5. 生产构建前将 `.env.production.example` 复制为 `.env.production` 并替换 API 域名。

## 5. 常用运维命令

```bash
docker compose ps
docker compose logs -f --tail=200 api
docker compose restart api
./backup.sh
```

订单支付状态只以服务端微信回调为准。服务器应启用 NTP/chrony，并为磁盘、数据库备份、API 5xx 和支付回调失败设置监控告警。
