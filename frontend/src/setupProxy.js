const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:3001';
  // CRA uses `/ws` for its own hot-update socket by default. Proxying that
  // path to the API makes the backend try to parse webpack frames as the
  // application protocol and can crash the development server. Realtime
  // application sockets choose their development target in realtime.ts;
  // only REST requests need the CRA proxy here.
  app.use('/api', createProxyMiddleware({ target, changeOrigin: false }));
};
