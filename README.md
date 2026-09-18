# 星链云客系统（LinkBot-AI）

这是一个多租户客户服务 MVP：管理后台、持久化客户会话、人工回复队列、客户在线咨询入口、留资和 AI 草稿审核。当前真实可用的渠道是 Web 客户咨询；抖音、快手、视频号和小红书能力在完成官方权限与真实收发证据前保持 `unverified`，不会模拟授权、监听或回复成功。

## 当前架构

```text
浏览器 / Web 客户入口
        │
        ▼
Nginx（frontend） ── /api、/ws ── Node.js API + WebSocket + durable worker
                                      │
                              PostgreSQL + Redis
                                      │
                         可选平台适配器（profile: platform）
```

- `frontend/`：React、Ant Design 管理后台和 `/chat/:widgetId` 客户入口。
- `backend/`：Express API、JWT 会话、租户隔离、WebSocket、PostgreSQL 迁移、Redis 一次性连接票据和持久化任务 worker。
- `main.go`：平台适配器的安全占位服务；未完成真实平台核验时只返回明确的 `PLATFORM_UNVERIFIED`，不承接业务数据。
- `docs/rebuild/`：基线、文档审计、架构决策、状态、抖音能力矩阵和 spike 结论。

## 生产启动

需要 Docker、Docker Compose、Node.js 22（本地开发）和 PostgreSQL/Redis。先复制环境模板并生成随机密钥：

```bash
cp .env.template .env
openssl rand -base64 48  # 写入 JWT_SECRET
openssl rand -base64 32  # 写入 ENCRYPTION_KEY
```

填写数据库、CORS 和真实 AI 配置后启动：

```bash
docker compose up -d --build
docker compose ps
curl -fsS https://your-domain.example/readyz
```

首次初始化管理员（密码只通过环境变量传入，不写入仓库）：

```bash
docker compose exec -e ADMIN_USERNAME=your-admin \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_PASSWORD='replace-with-a-long-password' \
  -e TENANT_NAME='你的企业' backend npm run init-admin
```

生产环境默认关闭自助注册，JWT、刷新会话、数据库和 Redis 均为必需依赖。不要提交 `.env`；平台应用密钥和 Coze Token 只放在服务端密钥管理中，并在泄露后立即轮换。

## 本地开发

```bash
cp .env.template .env
# 将 NODE_ENV 改为 development，并准备本机 PostgreSQL/Redis
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

也可以分别启动：

```bash
cd backend
npm ci
npm run build
npm run migrate
npm run dev

cd ../frontend
npm ci
npm start
```

本地 API 默认 `http://localhost:3001`，前端默认 `http://localhost:3000`。数据库迁移文件位于 `backend/src/db/migrations/`。

## 能力边界

已实现并以数据库为事实来源的链路：

- PostgreSQL 多租户用户、会话、访客入口、会话、消息、线索、知识文档、AI 运行记录、审计日志和任务队列。
- JWT 短期访问令牌 + HttpOnly 刷新 Cookie；WebSocket 使用 Redis 一次性票据，不复用 API Token。
- 客户在线咨询、历史消息恢复、人工回复、消息投递状态、AI 草稿任务和人工批准后发送。
- 客户主动提交手机号或邮箱后才创建/更新线索。

明确未完成的模块会返回 `501 FEATURE_NOT_IMPLEMENTED` 或 `503 PLATFORM_UNVERIFIED`，不返回演示套餐、随机指标、假 OAuth 或固定回复：计费、意图规则、未核验平台适配和部分工作流页面仍需单独实现。

抖音核验清单见 [`docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md`](docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md)；总体状态见 [`docs/rebuild/STATUS.md`](docs/rebuild/STATUS.md)。

## 验证命令

```bash
cd backend
npm run build
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high

cd ../frontend
npm run build
```

没有真实平台凭据和官方权限时，只能验证未核验分支的安全阻断，不能把平台收发标记为通过。Docker 镜像构建、Coze 真实调用和平台真实收发还需要对应运行环境与授权证据。
