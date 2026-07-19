#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

for command in docker curl; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

[[ -f .env ]] || { echo "Copy deploy/.env.example to deploy/.env and fill production values." >&2; exit 1; }
set -a
source .env
set +a

required=(API_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD JWT_SECRET WX_APP_ID WX_APP_SECRET)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name in deploy/.env" >&2; exit 1; }
done
[[ ${#JWT_SECRET} -ge 32 ]] || { echo "JWT_SECRET must contain at least 32 characters" >&2; exit 1; }
[[ -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem" ]] || { echo "TLS certificate for ${API_DOMAIN} was not found under /etc/letsencrypt." >&2; exit 1; }

mkdir -p secrets
for secret in wechat_mch_private_key.pem wechat_platform_cert.pem; do
  [[ -f "secrets/${secret}" ]] || { echo "Missing deploy/secrets/${secret}" >&2; exit 1; }
  chmod 600 "secrets/${secret}"
done

docker compose build --pull api
docker compose run --rm api node dist/scripts/migrate.js
if [[ "${SEED_ON_DEPLOY:-false}" == "true" ]]; then
  docker compose run --rm api node dist/scripts/seed.js
fi
if [[ -n "${ADMIN_SEED_USERNAME:-}" && -n "${ADMIN_SEED_PASSWORD:-}" ]]; then
  docker compose run --rm api node dist/scripts/create-admin.js
fi
docker compose up -d --remove-orphans

for _ in {1..30}; do
  if curl --fail --silent "https://${API_DOMAIN}/health" >/dev/null; then
    echo "Deployment healthy: https://${API_DOMAIN}/health"
    exit 0
  fi
  sleep 2
done

docker compose logs --tail=100 api nginx
echo "Deployment did not become healthy in time." >&2
exit 1
