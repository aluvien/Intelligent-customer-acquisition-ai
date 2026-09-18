#!/usr/bin/env bash
set -euo pipefail

echo "当前平台适配器尚未完成真实核验，不启动 ngrok 或伪造 OAuth 回调。"
echo "请先完成 docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md 中的 T7 证据要求。" >&2
exit 1
