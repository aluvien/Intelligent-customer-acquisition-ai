# 管理后台与客户咨询入口

前端使用 React、React Router 和 Ant Design。管理后台通过 `/api` 调用 Node 服务，客户入口为 `/chat/:widgetId`；生产环境由同一 Nginx 提供静态文件并代理 `/api` 与 `/ws`。

```bash
npm ci
npm start       # http://localhost:3000
npm run build   # 生产构建
```

本地开发默认使用 `package.json` 中的 CRA proxy 转发到 `http://localhost:3001`。如需覆盖 API 地址，可复制 `.env.example` 为 `.env`；不要提交任何环境文件或凭据。
