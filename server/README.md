# 星选商城 API 开发

## 本地启动

```powershell
docker compose -f server/docker-compose.dev.yml up -d
Copy-Item server/.env.example server/.env
```

编辑 `server/.env`，本地最低配置如下：

```env
NODE_ENV=development
DATABASE_URL=postgres://xingxuan:xingxuan_dev_password@127.0.0.1:5432/xingxuan
JWT_SECRET=local_development_secret_at_least_32_chars
ALLOW_DEV_LOGIN=true
```

然后执行：

```powershell
pnpm server:migrate
pnpm server:seed
pnpm server:dev
```

API 地址为 `http://127.0.0.1:3000/api/v1`，健康检查为 `http://127.0.0.1:3000/health`。小程序开发构建会使用根目录 `.env.development` 中的地址。

真机预览时，`127.0.0.1` 指向手机自身，应改成电脑局域网 IP，并确保防火墙允许开发端口。正式环境必须使用微信后台配置过的 HTTPS 合法域名。

接口说明见 [API.md](./API.md)，Ubuntu 生产部署见根目录 [DEPLOY_UBUNTU.md](../DEPLOY_UBUNTU.md)。
