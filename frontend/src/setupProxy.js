const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:3001';
  app.use(['/api', '/ws'], createProxyMiddleware({ target, changeOrigin: false, ws: true }));
};
