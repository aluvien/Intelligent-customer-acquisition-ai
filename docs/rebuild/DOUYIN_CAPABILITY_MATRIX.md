# 抖音能力矩阵

截至 2026-09-19，网站应用 OAuth 扫码授权、一次性状态、管理员会话绑定、账号信息读取和凭据加密持久化已经实现；没有配置时明确阻断。仓库仍没有可安全用于真实联调的当前应用凭据、审批记录、测试账号和平台端收发证据，因此账号授权等待真实验收，消息能力继续保持 `unverified/blocked`。

| 能力 | 文档存在 | 应用已获批 | 账号已授权 | 真实测试通过 | 当前处理 |
|---|---:|---:|---:|---:|---|
| OAuth | 官方流程已按当前文档实现 | 未提供证据 | 未提供证据 | 否 | 配置齐全后允许管理员生成一次性扫码请求；缺少配置时返回 `DOUYIN_NOT_CONFIGURED/DOUYIN_CONFIG_INVALID` |
| 账号信息 | 已实现 `user_info` 调用与严格响应校验 | 未提供证据 | 未提供证据 | 否 | 真实回调成功后加密保存凭据并持久化账号；待真实平台验收 |
| 视频/评论读取 | 有历史说明 | 未提供证据 | 未提供证据 | 否 | 不启用 |
| 评论回复 | 有历史说明 | 未提供证据 | 未提供证据 | 否 | 不启用 |
| 直播互动 | 有历史说明 | 未提供证据 | 未提供证据 | 否 | 不启用 |
| 私信读写 | 历史文档相互矛盾 | 未提供证据 | 未提供证据 | 否 | 不启用 |

账号 OAuth 不等于消息能力。T7 真实验收完成前禁止把 access token 当作内部 WebSocket token，禁止使用历史 Markdown 中的应用密钥，禁止批量或自动发送。生产回调必须使用抖音开放平台登记的 HTTPS 地址 `/api/channels/douyin/oauth/callback`。

当前实现依据抖音开放平台的[获取授权码](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/douyin-get-permission-code)、[获取 access_token](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/get-access-token)和[获取用户公开信息](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/account-permission/get-account-open-info)文档。
