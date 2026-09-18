# 管理后台与客户咨询入口

前端使用 React、React Router 和 Ant Design。管理后台通过 `/api` 调用 Node 服务，客户入口为 `/chat/:widgetId`；生产环境由同一 Nginx 提供静态文件并代理 `/api` 与 `/ws`。

```bash
npm ci
npm start       # http://localhost:3000
npm run build   # 生产构建
```

本地开发使用 `src/setupProxy.js` 将 `/api` 和 `/ws` 转发到 `http://localhost:3001`。如需覆盖代理目标，可在未提交的 `.env.local` 中设置 `REACT_APP_PROXY_TARGET`；如需修改生产 API 前缀，可设置 `REACT_APP_API_URL`。不要提交任何环境文件或凭据。使用开发 Compose 时，代理目标应设置为容器内的 `http://backend:3001`。
