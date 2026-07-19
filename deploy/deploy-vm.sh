#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null || { echo "Docker is not installed." >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose plugin is not installed." >&2; exit 1; }

if [[ ! -f .env.vm ]]; then
  command -v openssl >/dev/null || { echo "OpenSSL is required to generate local VM secrets." >&2; exit 1; }
  db_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 12)"
  cat > .env.vm <<EOF
POSTGRES_DB=xingxuan
POSTGRES_USER=xingxuan
POSTGRES_PASSWORD=${db_password}
JWT_SECRET=${jwt_secret}
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
WX_APP_ID=wx0818ea9aee0675a8
WX_APP_SECRET=
ADMIN_ACCESS_TOKEN_TTL_SECONDS=28800
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=${admin_password}
ADMIN_SEED_DISPLAY_NAME=系统管理员
SEED_ON_DEPLOY=true
EOF
  chmod 600 .env.vm
  echo "Generated deploy/.env.vm with random local VM credentials."
fi

if ! grep -q '^ADMIN_SEED_USERNAME=' .env.vm; then
  admin_password="$(openssl rand -hex 12)"
  cat >> .env.vm <<EOF
ADMIN_ACCESS_TOKEN_TTL_SECONDS=28800
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=${admin_password}
ADMIN_SEED_DISPLAY_NAME=系统管理员
EOF
  chmod 600 .env.vm
  echo "Added a generated administrator to deploy/.env.vm. Read the file once to retrieve the password."
fi

set -a
source .env.vm
set +a
[[ ${#JWT_SECRET} -ge 32 ]] || { echo "JWT_SECRET must contain at least 32 characters." >&2; exit 1; }

compose=(docker compose --env-file .env.vm -f docker-compose.vm.yml)
"${compose[@]}" build api
"${compose[@]}" up -d postgres
"${compose[@]}" run --rm api node dist/scripts/migrate.js
if [[ "${SEED_ON_DEPLOY:-true}" == "true" ]]; then
  "${compose[@]}" run --rm api node dist/scripts/seed.js
fi
"${compose[@]}" run --rm api node dist/scripts/create-admin.js
"${compose[@]}" up -d api

for _ in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then
    echo "VM API is healthy: http://$(hostname -I | awk '{print $1}'):3000/health"
    exit 0
  fi
  sleep 2
done

"${compose[@]}" logs --tail=100 api postgres
echo "VM API did not become healthy in time." >&2
exit 1
