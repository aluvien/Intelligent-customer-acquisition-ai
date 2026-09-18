import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// 启动前密钥检查：生产缺 JWT_SECRET 直接退出，开发警告
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET 未设置，拒绝启动');
    process.exit(1);
  } else {
    console.warn('⚠️  JWT_SECRET 未设置，开发环境使用默认密钥，切勿用于生产');
  }
}

// 安全中间件
app.use(helmet());

// CORS 配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// 压缩中间件
app.use(compression());

// 日志中间件
app.use(morgan('combined'));

// 限流中间件 - 为登录接口设置更宽松的限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 20, // 登录接口：15分钟内最多20次尝试
  message: {
    success: false,
    message: '登录尝试过于频繁，请稍后再试',
  },
  skipSuccessfulRequests: true, // 成功请求不计入限制
  standardHeaders: true,
  legacyHeaders: false,
});

// 通用限流中间件 - 排除登录和注册接口
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 分钟
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 限制每个 IP 100 次请求
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试',
  },
  skip: (req) => {
    // 跳过登录和注册接口，它们使用专门的限流
    // 注意用 originalUrl：挂载到 /api 下后 req.path 会被剥离前缀
    return req.originalUrl === '/api/auth/login' || req.originalUrl === '/api/auth/register';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 敏感接口（改密/刷新/token校验）独立严格限流
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 30,
  message: {
    success: false,
    message: '操作过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录和注册接口使用更宽松的限流（在路由之前应用）
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);

// 敏感接口独立限流
app.use('/api/auth/password', sensitiveLimiter);
app.use('/api/auth/refresh', sensitiveLimiter);
app.use('/api/auth/me', sensitiveLimiter);

// 其他API使用通用限流
app.use('/api', limiter);

// 解析 JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '星链云客系统 API 服务运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API 路由
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: '星链云客系统 API 服务',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      channels: '/api/channels',
      conversations: '/api/conversations',
      leads: '/api/leads',
      ai: '/api/ai',
      analytics: '/api/analytics',
      system: '/api/system',
    },
  });
});

// 鉴权保护的业务路由（必须在 simple 挂载之前注册，否则中间件不执行）
const { requireAuth } = require('./middleware/auth');
app.use('/api/analytics', requireAuth);
app.use('/api/channels', requireAuth);
app.use('/api/conversations', requireAuth);
app.use('/api/leads', requireAuth);
app.use('/api/ai', requireAuth);

// 真实鉴权路由（bcrypt + JWT，见 routes/auth.ts）
app.use('/api/auth', require('./routes/auth'));

// 实时网关：先鉴权换一次性 ticket，再连 WS（见 routes/realtime + realtime/hub）
app.use('/api/ws', requireAuth, require('./routes/realtime'));

// 简化业务路由（mock 数据 + 抖音转发，登录逻辑已迁移到 routes/auth）
app.use('/api', require('./routes/simple'));

// 完整路由（暂时注释，等修复错误后再启用）
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/channels', require('./routes/channels'));
// app.use('/api/conversations', require('./routes/conversations'));
// app.use('/api/leads', require('./routes/leads'));
// app.use('/api/ai', require('./routes/ai'));
// app.use('/api/analytics', require('./routes/analytics'));
// app.use('/api/system', require('./routes/system'));

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl,
  });
});

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 启动服务器（保留 server 句柄，供 WS 网关复用同一端口）
const server = app.listen(PORT, () => {
  console.log('🚀 星链云客系统 后端服务启动成功！');
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`📚 API文档: http://localhost:${PORT}/api`);
  console.log(`🔌 WS 网关: ws://localhost:${PORT}/ws (需先 GET /api/ws/ticket)`);
  console.log(`🏢 星链云客系统 · 企业版`);
});

// WS 实时网关挂载到同一端口
require('./realtime/hub').attach(server);

export default app;
