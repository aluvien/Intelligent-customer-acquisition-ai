# Coze 配置指南（当前 Node 后端）

本文只适用于当前仓库的 `backend/` 服务。旧版 Go 代理、`/open/v1/bot/chat`、固定电脑路径和向终端打印 Token 的示例已经废弃；不要按历史文档启动或提交任何凭据。

## 1. 创建并发布 Bot

在 Coze 工作台创建并发布一个可通过 API 调用的 Bot，记录 Bot ID，并给访问令牌开通 `chat`、`getChat` 和 `listMessage` 权限。当前实现实际使用发起对话、查询对话状态和读取消息三个 v3 操作；请以 Coze 官方文档显示的最新权限名称和接口为准：

- [发起对话 API](https://docs.coze.cn/developer_guides_chat_v3)
- [查看对话消息详情 API](https://docs.coze.cn/developer_guides_list_chat_messages)

## 2. 配置服务端环境变量

只在部署平台的服务端密钥管理中设置：

```dotenv
AI_PROVIDER=coze
COZE_API_URL=https://api.coze.cn/v3
COZE_BOT_ID=你的Bot_ID
COZE_TOKEN=你的服务端Token
```

`COZE_API_URL` 必须指向包含 `/v3` 的 API 根地址。当前代码会调用 `/chat`、`/chat/retrieve` 和 `/chat/message/list`，不会把 Token 返回给浏览器或写入 HTML。

## 3. 当前调用行为

后端只会把已发布的企业知识拼入 `additional_messages`，并使用 `stream: false`。非流式调用会：

1. 记录 Coze 返回的 `conversation_id` 和 `chat_id`；
2. 进入供应商 HTTP 阶段时设置 30 秒总预算；初始 POST 最长 20 秒且受剩余总预算限制，后续查询在剩余预算内继续；锁等待和数据库操作耗时另行说明。查询使用 `GET /chat/retrieve`（对应 getChat 权限）轮询；
3. 调用 `GET /chat/message/list`（对应 listMessage 权限），只接受结构完整的 `role=assistant`、`type=answer`、文本类型消息，并合并所有 answer 片段；
4. 忽略 `verbose`、`follow_up`、工具调用和用户消息；
5. 把知识文档 ID、标题和版本写入 AI 运行证据，把用量写入 `ai_runs.usage`。

如果没有已发布知识、供应商未配置、返回超时或没有可用 assistant answer，任务会明确标记为 blocked/failed，不会生成固定兜底话术。

## 4. 本地验证

不要把真实 Token 写入仓库。可在临时 shell 环境中导出变量后启动：

```bash
export COZE_API_URL=https://api.coze.cn/v3
export COZE_BOT_ID=your-bot-id
export COZE_TOKEN=your-server-token
docker compose up -d --build
```

先通过管理后台发布一篇企业知识，再在“客服工作台”发送访客消息。AI 草稿必须由客服点击“批准并发送”后才会进入回复队列；自动模式只能由管理员开启，并受到每个会话的小时级 AI 调用上限保护。

如果凭据曾经出现在日志、截图、历史提交或聊天记录中，应立即在 Coze 侧撤销并重新签发。当前树只检查代码和文档，不等于历史凭据已经失效。
