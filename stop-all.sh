#!/bin/bash

# CEO，一键停止LinkBot-AI所有服务
# 使用方法：bash stop-all.sh

echo "🛑 LinkBot-AI 一键停止脚本"
echo "=========================="

stop_port() {
    local port=$1
    local name=$2
    echo "⏹️  停止${name} (${port})..."
    if lsof -ti:$port > /dev/null 2>&1; then
        # 先优雅退出，2 秒后仍在才强制杀
        kill $(lsof -ti:$port) 2>/dev/null
        sleep 2
        if lsof -ti:$port > /dev/null 2>&1; then
            kill -9 $(lsof -ti:$port) 2>/dev/null
        fi
        echo "✅ ${name}已停止"
    else
        echo "ℹ️  ${name}未运行"
    fi
}

stop_port 3000 "前端"
stop_port 3001 "后端"
stop_port 8080 "Go代理"

# 停止ngrok
echo "⏹️  停止ngrok..."
pkill ngrok 2>/dev/null
echo "✅ ngrok已停止"

echo ""
echo "✅ 所有服务已停止！"

