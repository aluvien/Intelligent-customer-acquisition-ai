# 改造状态

更新时间：2026-09-19

| 阶段 | 状态 | 说明 |
|---|---|---|
| T0 基线与文档 | passed | 已记录真实调用链、模拟路径和文档冲突 |
| T1 构建/部署/安全 | source/config/CI images passed | Docker/Compose 配置解析、Node 构建、前端构建、启动脚本和当前树凭据脱敏已验证；GitHub Actions 已完成后端、前端 Nginx 和根 Go 镜像构建。本机 Docker 守护进程未运行，因此本机未重复构建 |
| T2 数据库/认证 | passed locally | PostgreSQL 全量迁移（含全局大小写不敏感用户名唯一性、租户复合外键和 AI provider 会话字段）、真实用户/租户、原子刷新会话轮换、JWT 类型/租户状态校验、Redis WS ticket 和加密凭据已在临时 PostgreSQL 集成环境验证 |
| T3 业务任务链路 | passed locally | 标准事件、访客/人工消息幂等、事务内持久化 job、租约续期与 fencing、模式版本校验、provider_accepted/delivered 边界、AI 调用上限和 Worker 已实现；仍需故障注入矩阵 |
| T4 网页客服 | implemented; browser UX pending | 访客会话、公开聊天页面、客服工作台、实时通知、历史恢复和 AI 草稿断线恢复已实现；HTTP/数据库链路通过，待双浏览器验收 |
| T5 AI 草稿 | implemented with provider validation pending | 已按 Coze v3 `additional_messages`、retrieve 轮询、消息列表严格 answer 提取、知识版本证据和 provider conversation 映射实现；真实凭据联调未执行 |
| T6 接管/线索 | implemented; race tests pending | 人工/草稿/自动模式、模式版本、审批发送、客户主动留资和跟进表已实现；HTTP 集成已覆盖留资同意和人工回复幂等，待更完整竞态测试 |
| T7 抖音能力核验 | blocked | 当前没有可安全使用的真实授权/权限/测试账号证据 |
| T8 平台适配器 | blocked | 必须等待 T7 的真实能力证据 |
| T9 发布验收 | CI passed; integration pending | GitHub Actions 已通过 Node/前端构建、前后端测试、Go test/vet、生产 Compose 配置和后端/前端/根 Go 镜像构建；本地临时 PostgreSQL 全量迁移（含 005/006）和依赖审计也已执行。数据库/Redis 并发、双浏览器、备份恢复、真实 AI/平台仍未完成，继续保持 blocked 或 pending |

本文件只记录已执行的验证；未运行的测试不能写成通过。
