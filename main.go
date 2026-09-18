package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"live-im-proxy/channel"
	"live-im-proxy/health"
	"live-im-proxy/limiter"
	"live-im-proxy/oauth"
	"live-im-proxy/pipeline"
)

type Config struct {
	Port        string
	Channels    []string
	CozeAPI     string
	CozeToken   string
	NBAPI       string
	NBToken     string
	RedisURL    string
	DouyinAppID string
	DouyinAppSecret string
	RedirectURI string
}

func main() {
	// 加载配置
	config := &Config{
		Port:        getEnv("PORT", "8080"),
		Channels:    []string{"douyin", "kuaishou", "wechat", "xiaohongshu"},
		CozeAPI:     getEnv("COZE_API", "https://api.coze.com/open/v1"),
		CozeToken:   getEnv("COZE_TOKEN", ""),
		NBAPI:       getEnv("NB_API", ""),
		NBToken:     getEnv("NB_TOKEN", ""),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		DouyinAppID: getEnv("DOUYIN_APP_ID", ""),
		DouyinAppSecret: getEnv("DOUYIN_APP_SECRET", ""),
		RedirectURI: getEnv("REDIRECT_URI", "http://localhost:8080/oauth/callback"),
	}

	log.Printf("星链云客系统 · 渠道代理服务启动中...")
	log.Printf("服务端口: %s", config.Port)
	log.Printf("支持渠道: %v", config.Channels)
	log.Printf("🔑 DouyinAppID: %s", config.DouyinAppID)
	log.Printf("🔑 DouyinAppSecret: %s", maskSecret(config.DouyinAppSecret))
	log.Printf("🔗 RedirectURI: %s", config.RedirectURI)

	// 初始化限流器
	cozeLimiter := limiter.NewRateLimiter(10, 20) // 10 QPS, 突发 20

	// 初始化管道
	pipeline := pipeline.NewPipeline(config.CozeAPI, config.CozeToken, config.NBAPI, config.NBToken, cozeLimiter)

	// 初始化渠道管理器
	channelManager := channel.NewManager(pipeline)

	// 暂不自动启动渠道，等待OAuth授权后动态启动
	// 启动渠道连接（已禁用，等待OAuth授权）
	// for _, channelType := range config.Channels {
	// 	go func(ch string) {
	// 		if err := channelManager.StartChannel(ch); err != nil {
	// 			log.Printf("❌ 启动渠道 %s 失败: %v", ch, err)
	// 		}
	// 	}(channelType)
	// }

	// 初始化OAuth
	douyinOAuth := oauth.NewDouyinOAuth(config.DouyinAppID, config.DouyinAppSecret, config.RedirectURI)

	// 账号存储结构
	type AccountInfo struct {
		Token    *oauth.OAuthToken
		UserInfo *oauth.UserInfo
	}
	
	// 存储账号信息（临时使用内存存储）
	accountStore := make(map[string]*AccountInfo)

	// 设置路由
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		html := `
<!DOCTYPE html>
<html>
<head>
    <title>星链云客系统 企业级全渠道智能客服平台</title>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; margin: 0; background: #F2F4F7; color: #1A2332; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #1890ff; text-align: center; }
        .status { background: #f6ffed; border: 1px solid #b7eb8f; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .endpoints { background: #f0f9ff; border: 1px solid #91d5ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .endpoint { margin: 10px 0; }
        .method { background: #1E3A5F; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px; }
        .url { font-family: monospace; background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="container">
        <div style="background:#0F2342;color:#fff;padding:20px 0;margin:-8px -8px 0 -8px;"><div style="max-width:800px;margin:0 auto;padding:0 30px;"><div style="font-size:11px;letter-spacing:4px;color:rgba(255,255,255,0.55);">STARLINK CLOUD</div><div style="font-size:24px;font-weight:700;letter-spacing:2px;margin-top:4px;">星链云客系统</div><div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">企业级全渠道智能客服平台 · 企业版</div></div></div>
        
        <div class="status">
            <h3>服务状态 · 运行正常</h3>
            <p>服务运行正常，端口: ` + config.Port + `</p>
            <p>支持渠道: ` + fmt.Sprintf("%v", config.Channels) + `</p>
        </div>
        
        <div class="endpoints">
            <h3>服务接口</h3>
            <div class="endpoint">
                <span class="method">GET</span> <span class="url">/health</span> - 健康检查
            </div>
            <div class="endpoint">
                <span class="method">GET</span> <span class="url">/oauth/douyin</span> - 抖音OAuth授权
            </div>
            <div class="endpoint">
                <span class="method">GET</span> <span class="url">/oauth/douyin/whitelist</span> - 抖音白名单授权
            </div>
            <div class="endpoint">
                <span class="method">POST</span> <span class="url">/api/channel/douyin/start</span> - 启动抖音监听
            </div>
            <div class="endpoint">
                <span class="method">GET</span> <span class="url">/ws</span> - WebSocket连接
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
            <p>© 2026 星链云客系统 · 企业版</p>
            <p>部署时间: ` + time.Now().Format("2006-01-02 15:04:05") + `</p>
        </div>
    </div>
</body>
</html>`
		w.Write([]byte(html))
	})
	
	http.HandleFunc("/health", health.Handler)
	http.HandleFunc("/ws", channelManager.WebSocketHandler)
	
	// OAuth授权路由 - 支持JSON和重定向两种方式
	http.HandleFunc("/oauth/douyin", func(w http.ResponseWriter, r *http.Request) {
		authURL := douyinOAuth.GetAuthURL()
		
		// 如果请求头包含 Accept: application/json，返回JSON格式
		if r.Header.Get("Accept") == "application/json" || r.URL.Query().Get("format") == "json" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"auth_url": authURL,
				"message": "获取授权URL成功",
			})
			return
		}
		
		// 默认重定向到抖音授权页面
		http.Redirect(w, r, authURL, http.StatusFound)
	})
	
	// 白名单授权路由
	http.HandleFunc("/oauth/douyin/whitelist", func(w http.ResponseWriter, r *http.Request) {
		whitelistOAuth := oauth.NewDouyinOAuth(config.DouyinAppID, config.DouyinAppSecret, config.RedirectURI, "trial.whitelist")
		authURL := whitelistOAuth.GetAuthURL()
		http.Redirect(w, r, authURL, http.StatusFound)
	})
	
	// API: 测试模拟事件
	http.HandleFunc("/api/test/simulate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		log.Printf("🎬 启动模拟事件测试")

		douyinChannel, err := channel.NewDouyinChannel(pipeline)
		if err != nil {
			http.Error(w, "创建渠道失败: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// 启动模拟事件（传入空的access_token使用模拟模式）
		err = douyinChannel.Start("123456789", "")
		if err != nil {
			http.Error(w, "启动渠道失败: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("✅ 模拟事件已启动")

		response := map[string]interface{}{
			"success": true,
			"message": "模拟事件已启动，请观察日志中的事件处理流程",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		
		log.Printf("📨 收到OAuth回调: code=%s, state=%s", code, state)
		
		if code == "" {
			http.Error(w, "缺少授权码", http.StatusBadRequest)
			return
		}
		
		// 换取访问令牌
		token, err := douyinOAuth.ExchangeCodeForToken(code)
		if err != nil {
			log.Printf("❌ 获取访问令牌失败: %v", err)
			http.Error(w, "获取访问令牌失败", http.StatusInternalServerError)
			return
		}
		
		log.Printf("📝 Token详情: OpenID=%s, Scope=%s", token.OpenID, token.Scope)
		
		// 尝试获取用户信息（可能失败，白名单授权没有用户信息权限）
		userInfo, err := douyinOAuth.GetUserInfo(token.AccessToken)
		if err != nil {
			log.Printf("⚠️  获取用户信息失败（可能是白名单授权）: %v", err)
			// 对于白名单授权，使用OpenID作为key
			openID := token.OpenID
			if openID == "" {
				openID = "whitelist_" + state
			}
			
			accountStore[openID] = &AccountInfo{
				Token:    token,
				UserInfo: nil,
			}
			
			log.Printf("✅ 白名单授权成功: open_id=%s", openID)
			
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(fmt.Sprintf(`
				<h1>✅ 白名单授权成功！</h1>
				<p>OpenID: %s</p>
				<p>授权已完成，你可以关闭此页面</p>
				<p><a href="/oauth/douyin">点击这里进行用户授权</a></p>
			`, openID)))
			return
		}
		
		// 保存账号信息到内存（key为open_id）
		accountStore[userInfo.OpenID] = &AccountInfo{
			Token:    token,
			UserInfo: userInfo,
		}
		log.Printf("✅ 保存账号信息: open_id=%s, nickname=%s", userInfo.OpenID, userInfo.Nickname)
		
		// 返回HTML页面，显示授权信息并通知父窗口
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		html := fmt.Sprintf(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>授权成功</title>
				<meta charset="utf-8">
			</head>
			<body>
				<h1>✅ 抖音授权成功！</h1>
				<div id="tokenInfo" style="background:#f5f5f5; padding:20px; margin:20px 0; border-radius:8px;">
					<h3>授权信息：</h3>
					<p><strong>OpenID:</strong> %s</p>
					<p><strong>昵称:</strong> %s</p>
					<p><strong>Access Token:</strong> %s</p>
					<p><strong>有效期:</strong> %d秒</p>
				</div>
				<p>授权已完成，你可以关闭此页面</p>
				<script>
					// 通知父窗口授权成功
					if (window.opener) {
						window.opener.postMessage({
							type: 'DOUYIN_AUTH_SUCCESS',
							data: {
								"open_id": "%s",
								"nickname": "%s", 
								"access_token": "%s",
								"expires_in": %d,
								"avatar": "%s"
							}
						}, '*');
					}
				</script>
			</body>
			</html>
		`, userInfo.OpenID, userInfo.Nickname, token.AccessToken, token.ExpiresIn,
		   userInfo.OpenID, userInfo.Nickname, token.AccessToken, token.ExpiresIn, userInfo.Avatar)
		w.Write([]byte(html))
	})
	
	// API: 启动抖音渠道监听
	http.HandleFunc("/api/channel/douyin/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		
		// 解析请求参数
		openID := r.FormValue("open_id")
		roomID := r.FormValue("room_id")
		
		if openID == "" || roomID == "" {
			http.Error(w, "缺少参数: open_id 或 room_id", http.StatusBadRequest)
			return
		}
		
		// 从存储中获取access_token
		accountInfo, exists := accountStore[openID]
		if !exists {
			http.Error(w, "未找到账号信息，请先授权", http.StatusNotFound)
			return
		}
		
		token := accountInfo.Token
		
		log.Printf("🎯 启动抖音渠道监听: open_id=%s, room_id=%s", openID, roomID)
		
		// 创建抖音渠道实例
		douyinChannel, err := channel.NewDouyinChannel(pipeline)
		if err != nil {
			http.Error(w, "创建渠道失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		
		// 将channel设置为pipeline的回复发送器
		pipeline.SetReplySender(douyinChannel)
		
		// 启动渠道监听
		err = douyinChannel.Start(roomID, token.AccessToken)
		if err != nil {
			log.Printf("❌ 启动渠道失败: %v", err)
			http.Error(w, "启动渠道失败: "+err.Error(), http.StatusInternalServerError)
			return
		}
		
		log.Printf("✅ 抖音渠道启动成功")
		
		// 返回成功
		response := map[string]interface{}{
			"success": true,
			"message": "渠道启动成功",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})
	
	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		status := map[string]interface{}{
			"status":    "running",
			"channels":  channelManager.GetChannelStatus(),
			"timestamp": time.Now().Unix(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	})

	// 启动 HTTP 服务器
	server := &http.Server{
		Addr:    ":" + config.Port,
		Handler: nil,
	}

	go func() {
		log.Printf("🌐 HTTP 服务器启动: http://localhost:%s", config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ HTTP 服务器启动失败: %v", err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 正在关闭服务器...")

	// 优雅关闭
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("❌ 服务器关闭失败: %v", err)
	}

	// 关闭渠道连接
	channelManager.StopAll()

	log.Println("✅ 服务器已关闭")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func maskSecret(secret string) string {
	if len(secret) < 8 {
		return "***"
	}
	return secret[:4] + "..." + secret[len(secret)-4:]
}
