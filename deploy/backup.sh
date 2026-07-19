#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
set -a; source .env; set +a
mkdir -p backups
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "backups/xingxuan-${timestamp}.dump"
find backups -type f -name '*.dump' -mtime +14 -delete
echo "Created backups/xingxuan-${timestamp}.dump"
