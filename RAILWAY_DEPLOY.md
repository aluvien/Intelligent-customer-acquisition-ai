# 旧 Railway 部署说明（已废弃）

这份文件记录的是改造前的“两仓库、Go/Node/NocoBase 三服务”方案，里面的路径、环境变量和平台能力均不再是当前实现的部署契约。不要按本文执行，也不要把历史示例密钥填入环境。

当前单仓库部署方式请看 [`README.md`](README.md)：

```bash
cp .env.template .env
docker compose up -d --build
```

当前核心依赖是 PostgreSQL、Redis、Node API/WebSocket 和前端 Nginx。根目录 Go 程序只是 T7/T8 未核验平台适配器的安全占位服务，默认不启用。抖音、快手、视频号和小红书在没有官方权限、专用测试账号及真实收发证据前都保持 `PLATFORM_UNVERIFIED`。

如果未来要迁移到 Railway，应以当前 `Dockerfile`、`backend/Dockerfile`、`frontend/Dockerfile`、`docker-compose.yml` 和 `.env.template` 为输入重新设计服务，而不是复用本文件的旧变量名或旧回调地址。
