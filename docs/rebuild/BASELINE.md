# 改造前可信基线（历史快照）

基线提交：`38f37ceba00ca4dfe331b578cbcc4cd9aab909f2`

本文件记录本轮改造开始前的源码状态，不描述当前 `main`。当前实现和验收状态以 `README.md`、`docs/rebuild/STATUS.md` 以及最新提交为准。

## 真实调用链

- 前端由 `frontend/src/App.tsx` 挂载 React 管理后台；页面通过 `frontend/src/services/api.ts` 调用 `/api`。
- Node 入口为 `backend/src/index.ts`。当前实际挂载了认证、鉴权、WS ticket 和 `routes/simple.ts`；完整业务路由仍被注释。
- `routes/simple.ts` 调用根目录 Go 服务的历史 HTTP 接口，并返回固定/随机演示数据。
- `backend/src/realtime/hub.ts` 在 Node 进程上提供 `/ws`，但 ticket 消费和连接集合仍是单机内存。
- 根目录 Go 服务 `main.go` 暴露 OAuth、渠道启动和测试模拟事件接口；渠道实例、账号、token 和发送器状态均为进程内存。
- Go `pipeline/pipeline.go` 异步处理后立即返回，只放行 `comment`，并把 AI/CRM/回复结果主要写日志。

## 当前状态

| 范围 | 状态 | 证据 |
|---|---|---|
| React/Ant Design 管理后台 | 已存在 | `frontend/src/App.tsx` |
| bcrypt/JWT 基础代码 | 部分实现，用户仍是内存数组 | `backend/src/routes/auth.ts` |
| Node WS 网关 | 已存在，ticket 为单机内存 | `backend/src/realtime/hub.ts` |
| PostgreSQL | Compose 声明但无 Node 迁移/仓储 | `docker-compose.yml`、`backend/src` |
| 业务持久化 | 未实现 | `routes/simple.ts`、`routes/conversations.ts`、`routes/leads.ts` |
| 访客网页聊天 | 未实现 | 无公开访客会话路由 |
| AI 草稿 | 模拟/旧式 Coze 调用，未持久化 | `backend/src/routes/ai.ts` |
| 线索闭环 | 内存数据 | `backend/src/routes/leads.ts` |
| 抖音 OAuth/收发 | 未验证；存在模拟/内存路径 | `main.go`、`channel/douyin.go` |
| 真实统计 | 未实现，含固定和随机值 | `backend/src/routes/analytics.ts`、`routes/simple.ts` |

## 当前基线未执行

基线阶段只做源码和文档核对；尚未将真实数据库、真实平台账号或真实客户消息联调标记为通过。
