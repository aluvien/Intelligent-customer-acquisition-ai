#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "缺少 .env。请复制 .env.template 后填写真实配置，不会自动生成密钥。" >&2
  exit 1
fi

exec docker compose --env-file .env up -d --build
