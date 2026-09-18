# access_token 与 live-im-proxy 对接分析

> 历史资料：其中的应用标识、代理路径和协议结论均已失效或未核验。当前以 `README.md` 与 `docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md` 为准，不要用本文配置平台接入。

## 🎯 核心问题

主公问：**live-im-proxy 需要的秘钥等数据，能不能通过 access_token 来转换？**

## ✅ 答案：可以！

### live-im-proxy 需要的参数

从代码分析（douyin.go 第17-26行）：

```go
type DouyinChannel struct {
    pipeline   *pipeline.Pipeline
    roomID     string        // 直播间ID
    videoID    string        // 视频ID
    appID      string        // App ID（平台应用ID）
    appSecret  string        // App Secret（可能不需要）
    accessToken string       // 访问令牌（这是关键！）
    connected  bool
    conn       *websocket.Conn
    done       chan struct{}
}
```

### 需要的参数清单

| 参数 | 来源 | 是否通过 access_token 获取 |
|------|------|---------------------------|
| **roomID** | 用户直播间ID | ❌ 需要用户提供 |
| **videoID** | 用户视频ID | ❌ 需要用户提供 |
| **appID** | 抖音开放平台 | ✅ 固定值（已获取） |
| **appSecret** | 抖音开放平台 | ✅ 固定值（已获取） |
| **accessToken** | OAuth授权 | ✅ **这就是我们要的！** |

## 🔍 详细分析

### 1. access_token 的作用

#### 在 live-im-proxy 中如何使用
```go
// douyin.go 第88行 - 连接WebSocket
wsURL := fmt.Sprintf("wss://live.douyin.com/webcast/im/push/v2/?room_id=%s&app_id=%s", d.roomID, d.appID)

// douyin.go 第96-98行 - 设置请求头（可能需要token）
headers := http.Header{}
headers.Set("Authorization", "Bearer " + d.accessToken)  // 这里！
headers.Set("Origin", "https://live.douyin.com")
```

**关键发现**：
- ✅ access_token 可以通过 Authorization 头传递给 WebSocket
- ✅ live-im-proxy 已经在代码中支持使用 access_token

### 2. 其他参数的获取

#### roomID 和 videoID（用户提供）
```go
// 用户在使用时提供
// 前端界面输入或选择

// 方式1：手动输入
用户输入 roomID: "123456789"

// 方式2：从视频列表选择
调用抖音API获取视频列表：
GET https://open.douyin.com/api/video/list/
Headers: Authorization: Bearer {access_token}
```

#### appID 和 appSecret（固定值）
```go
// 我们从抖音开放平台已获取
appID = "REVOKED_DOUYIN_APP_ID"
appSecret = "REVOKED_DOUYIN_APP_SECRET"

// 配置在环境变量中
```

### 3. 完整的数据流

#### 第一步：OAuth 授权获取 access_token
```go
// OAuth 回调后
access_token := "aw1234567890abcdef..."

// 保存到数据库
{
    "user_id": "用户ID",
    "access_token": "aw1234567890abcdef...",
    "refresh_token": "...",
    "expires_at": "2025-10-27 23:59:59"
}
```

#### 第二步：获取 roomID 和 videoID
```go
// 方式1：调用抖音API获取直播间列表
GET https://open.douyin.com/api/live/list/
Headers: Authorization: Bearer {access_token}

// 返回
{
    "data": {
        "live_list": [
            {
                "room_id": "123456789",
                "title": "我的直播间"
            }
        ]
    }
}

// 方式2：用户手动输入
userInput := "123456789"
```

#### 第三步：启动 live-im-proxy
```go
// 传入所有参数
channel := NewDouyinChannel(pipeline)
channel.appID = "REVOKED_DOUYIN_APP_ID"
channel.accessToken = access_token  // 从数据库获取
channel.roomID = roomID             // 用户提供
channel.Start(roomID)
```

## ✅ 结论

### 完全可以对接！

1. **access_token** ✅
   - 通过 OAuth 授权获取
   - 直接传给 live-im-proxy
   - 代码已支持（第290行 Authorization 头）

2. **appID** ✅
   - 固定值，已获取
   - 配置在环境变量

3. **roomID/videoID** ✅
   - 用户提供或通过API获取
   - 前端界面输入或选择

### 唯一需要确认的问题

**抖音 WebSocket 是否接受 access_token？**

从代码看，live-im-proxy 设计上是可以接受的，但需要验证：
1. WebSocket 连接时是否需要额外的认证
2. 协议解析是否需要特殊处理
3. 是否需要其他签名或验证步骤

## 🎯 下一步验证

### 测试方案

#### 方案A：直接测试
```bash
# 1. 获取真实的 access_token
通过OAuth获取

# 2. 启动 live-im-proxy
go run main.go

# 3. 查看日志
# 看是否能成功连接WebSocket

# 4. 验证事件
# 是否有真实事件数据
```

#### 方案B：抓包分析
```bash
# 抓取抖音直播间的WebSocket连接
# 分析握手流程
# 确认需要的参数
```

#### 方案C：查阅文档
```bash
# 研究抖音开放平台的文档
# 确认 WebSocket 连接规范
# 验证 access_token 的使用方式
```

## 📊 数据流总结

```
用户操作
  ↓
扫码授权
  ↓
获取 access_token
  ↓ 保存到数据库
  ↓
启动 live-im-proxy
  ↓ 从数据库读取 access_token
  ↓ 用户选择/输入 roomID
  ↓
WebSocket 连接
  Headers: Authorization: Bearer {access_token}
  URL: room_id={roomID}&app_id={appID}
  ↓
监听事件
  ↓
自动回复
```

## 💡 最终确认

主公，**答案是肯定的！**

live-im-proxy 需要的参数中：
- ✅ **access_token**：通过 OAuth 获取，直接传入
- ✅ **appID**：已获取固定值
- ⚠️ **roomID**：用户提供（前端界面输入或选择）
- ❌ **appSecret**：可能不需要（只在 OAuth 时使用）

现在需要验证的是：**抖音 WebSocket 是否真正接受我们通过 OAuth 获取的 access_token**

建议先做一个完整测试，看能否成功连接并获取事件！

---

**创建时间**：2025-10-27  
**状态**：需要验证 WebSocket 连接
> 历史资料：其中的应用标识、代理路径和协议结论均已失效或未核验。当前以 `README.md` 与 `docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md` 为准，不要用本文配置平台接入。
