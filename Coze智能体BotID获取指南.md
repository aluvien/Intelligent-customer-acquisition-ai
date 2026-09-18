# Coze Bot ID 获取指南

在 Coze 工作台打开已发布的 Bot，详情页 URL 中 `bot/` 后的数字就是 Bot ID。也可以在 Bot 的 API 调用示例中查看。

当前 Node 后端使用 Coze v3 API，配置在服务端密钥管理中：

```dotenv
AI_PROVIDER=coze
COZE_API_URL=https://api.coze.cn/v3
COZE_BOT_ID=your-bot-id
COZE_TOKEN=your-server-token
```

访问令牌必须具备 `chat` 和 `listMessage` 权限，Bot 必须已经发布。不要在终端回显 Token、不要把 Token 写入 `.env` 以外的仓库文件，也不要调用历史的 `/open/v1/bot/chat` 示例。

官方参考：

- [发起对话 API](https://docs.coze.cn/developer_guides_chat_v3)
- [查看对话消息详情 API](https://docs.coze.cn/developer_guides_list_chat_messages)

没有真实凭据时，只能运行仓库中的构建、迁移和安全阻断测试，不能把 AI 调用标记为已联调。
