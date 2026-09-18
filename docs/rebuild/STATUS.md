# 改造状态

更新时间：2026-09-19

| 阶段 | 状态 | 说明 |
|---|---|---|
| T0 基线与文档 | passed | 已记录真实调用链、模拟路径和文档冲突 |
| T1 构建/部署/安全 | source/config passed; image blocked | Docker/Compose 配置解析、Node 构建、前端构建、启动脚本和当前树凭据脱敏已验证；本机 Docker 守护进程未运行，未完成镜像构建 |
| T2 数据库/认证 | passed locally; migration update pending | PostgreSQL 迁移、真实用户/租户、全局大小写不敏感用户名唯一性、原子刷新会话轮换、JWT 类型/租户状态校验、Redis WS ticket 和加密凭据已实现；新增迁移需在目标数据库执行 |
| T3 业务任务链路 | passed locally; outbox update pending | 标准事件、消息去重、事务内持久化 job、租约/重试、发送状态和 Worker 已实现；仍需故障注入矩阵 |
| T4 网页客服 | implemented; browser UX pending | 访客会话、公开聊天页面、客服工作台、实时通知和历史恢复已实现；HTTP/数据库链路通过，待双浏览器验收 |
| T5 AI 草稿 | implemented with provider validation pending | Coze 非流式状态/消息读取、知识过滤、ai_runs 和 blocked 状态已实现；真实凭据联调未执行 |
| T6 接管/线索 | implemented; race tests pending | 人工/草稿/自动模式、模式版本、审批发送、客户主动留资和跟进表已实现；待竞态测试 |
| T7 抖音能力核验 | blocked | 当前没有可安全使用的真实授权/权限/测试账号证据 |
| T8 平台适配器 | blocked | 必须等待 T7 的真实能力证据 |
| T9 发布验收 | in-progress | Node/前端构建、Compose 配置、PostgreSQL/Redis 集成和依赖审计已执行；Go 编译和干净 Docker 镜像受本机缺少 Go/未运行 Docker 守护进程限制，真实 AI/平台仍保持 blocked |

本文件只记录已执行的验证；未运行的测试不能写成通过。
