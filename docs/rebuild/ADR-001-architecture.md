# ADR-001：第一版内部客服闭环架构

状态：accepted for MVP

## 决策

第一版以 Node/TypeScript 为唯一业务编排层，PostgreSQL 为唯一业务数据源，Redis 为实时连接 ticket 和通知的短期存储。Go 只作为经过 T7 验证后才启用的平台适配器，不承载 AI、线索或自动回复决策。NocoBase、计费、复杂流程画布和未验证的平台不作为核心启动依赖。

核心链路：

```text
访客消息 -> PostgreSQL message/event -> ai_draft job -> 人工审核
         -> web delivery message -> PostgreSQL 状态 -> WebSocket 通知
         -> 客户主动提交联系方式 -> lead + follow-up + analytics
```

## 约束

- 所有业务表带 `tenant_id`，租户由已验证身份或 widget/session 映射确定，不信任客户端租户头。
- 事件先持久化，再创建任务；外部事件按账号命名空间去重。
- AI 只生成草稿；默认不自动发送。发送状态不能把请求成功等同于送达。
- 数据库、Redis、模型和平台不可用时返回明确错误或 `blocked/unverified`，不回退到内存演示数据。

## 被否决的做法

- 在生产路由中保留固定用户、随机统计、模拟 OAuth 或“只写日志即成功”。
- 同时由 Node 和 Go 执行 AI、线索和回复。
- 把 OAuth token 写入 HTML、前端状态、日志或通配 `postMessage`。
