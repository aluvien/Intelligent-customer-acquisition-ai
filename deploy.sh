#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
echo "当前仓库不再使用旧 Railway 三服务脚本；请先阅读 README.md。"
echo "将执行本地 Docker Compose 启动。"
exec "$SCRIPT_DIR/start.sh" "$@"
