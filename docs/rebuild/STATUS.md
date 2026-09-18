# 改造状态

更新时间：2026-09-19

| 阶段 | 状态 | 说明 |
|---|---|---|
| T0 基线与文档 | passed | 已记录真实调用链、模拟路径和文档冲突 |
| T1 构建/部署/安全 | source/config/CI images passed | Docker/Compose 配置解析、Node 构建、前端构建、启动脚本和当前树凭据脱敏已验证；GitHub Actions `35404297806` 已完成后端、前端 Nginx、根 Go 镜像构建和 Go test/vet。本机 Docker 守护进程未运行，因此本机未重复构建 |
| T2 数据库/认证 | source passed; upgrade/concurrency pending | PostgreSQL 全量迁移（含 005–010、全局大小写不敏感用户名唯一性、租户复合外键、AI provider 状态和历史 run 安全分类）、访客可见性序列回填、旧版 008 边界纠正、真实用户/租户、原子刷新会话轮换、JWT 类型/租户状态校验、Redis WS ticket 和加密凭据已在临时环境验证；存量库预检、认证并发和备份恢复仍待验收 |
| T3 业务任务链路 | source passed; fault matrix pending | 标准事件、访客/人工消息幂等、事务内持久化 job、Worker 失败状态原子同步、租约续期与失效 fencing、模式版本校验、provider_accepted/delivered 边界和 AI 调用上限已实现；仍需故障注入矩阵 |
| T4 网页客服 | implemented; browser UX pending | 访客会话、公开聊天页面、客服工作台、稳定历史恢复、旧异步响应与视图代际隔离、并发 session 恢复去重、可见性序列分页与前端无损传递排序、模式切换代际与版本 fencing、实时通知和 AI 草稿断线恢复已实现；HTTP/数据库链路通过，待双浏览器验收 |
| T5 AI 草稿 | implemented with provider validation pending | 已按 Coze v3 `additional_messages`、retrieve 轮询、消息列表严格 answer 提取、知识版本证据、旧任务快照隔离、同会话 advisory lock 和 4016 可重试分类实现；真实凭据联调未执行 |
| T6 接管/线索 | implemented; race tests pending | 人工/草稿/自动模式、模式版本条件写入与冲突重试、审批发送、取消/失败自动消息的受控人工恢复、客户主动留资和跟进表已实现；HTTP 集成已覆盖留资同意和人工回复幂等，待更完整竞态测试 |
| T7 抖音能力核验 | blocked | 当前没有可安全使用的真实授权/权限/测试账号证据 |
| T8 平台适配器 | blocked | 必须等待 T7 的真实能力证据 |
| T9 发布验收 | CI passed; integration pending | GitHub Actions `35404297806` 已通过 Node/前端构建、前后端测试、Go test/vet、生产 Compose 配置和后端/前端/根 Go 镜像构建；本地临时 PostgreSQL 全量迁移（含 005–010）、迁移幂等、序列推进、旧版 008 边界纠正和依赖审计也已执行。数据库/Redis 并发、双浏览器、备份恢复、真实 AI/平台仍未完成，继续保持 blocked 或 pending |

本文件只记录已执行的验证；未运行的测试不能写成通过。
