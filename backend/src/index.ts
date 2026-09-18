import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config, assertProductionConfig } from './config';
import { AppError, asAppError } from './errors';
import { checkDatabase, pool } from './db';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/auth';
import realtimeRoutes from './routes/realtime';
import conversationsRoutes from './routes/conversations';
import leadsRoutes from './routes/leads';
import channelsRoutes from './routes/channels';
import analyticsRoutes from './routes/analytics';
import aiRoutes from './routes/ai';
import systemRoutes from './routes/system';
import widgetsRoutes from './routes/widgets';
import publicChatRoutes from './routes/publicChat';
import { attach } from './realtime/hub';
import { checkRedis } from './realtime/tickets';
import { startWorker, stopWorker } from './jobs/worker';

assertProductionConfig();

const app = express();
app.disable('x-powered-by');

app.use(helmet());
const adminCors = cors({ origin: config.corsOrigin.split(',').map((origin) => origin.trim()), credentials: true });
const publicCors = cors({ origin: true, credentials: false });
app.use((req, res, next) => (req.path === '/api/public' || req.path.startsWith('/api/public/')) ? publicCors(req, res, next) : adminCors(req, res, next));
app.use(compression());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: config.maxBodyBytes }));
app.use(express.urlencoded({ extended: true, limit: config.maxBodyBytes }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { success: false, message: '登录尝试过于频繁，请稍后再试' } });
const apiLimiter = rateLimit({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMaxRequests, standardHeaders: true, legacyHeaders: false, message: { success: false, message: '请求过于频繁，请稍后再试' } });
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

app.get('/health', (_req, res) => res.json({ success: true, message: '星链云客系统 API 服务运行中', data: { timestamp: new Date().toISOString(), version: process.env.APP_VERSION || 'development' } }));
app.get('/readyz', async (_req, res) => {
  const [database, redis] = await Promise.all([checkDatabase(), config.redisUrl ? checkRedis() : Promise.resolve(false)]);
  const ready = database && (!config.redisUrl || redis);
  res.status(ready ? 200 : 503).json({ success: ready, message: ready ? '服务已就绪' : '服务依赖未就绪', data: { database: database ? 'ready' : 'unavailable', redis: config.redisUrl ? (redis ? 'ready' : 'unavailable') : 'not-configured' } });
});
app.get('/api', (_req, res) => res.json({ success: true, message: '星链云客系统 API', data: { version: process.env.APP_VERSION || 'development', endpoints: ['/api/auth', '/api/conversations', '/api/leads', '/api/ai', '/api/analytics', '/api/channels', '/api/widgets', '/api/public'] } }));

app.use('/api/auth', authRoutes);
app.use('/api/ws', requireAuth, realtimeRoutes);
app.use('/api/conversations', requireAuth, conversationsRoutes);
app.use('/api/leads', requireAuth, leadsRoutes);
app.use('/api/channels', requireAuth, channelsRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/system', requireAuth, systemRoutes);
app.use('/api/widgets', requireAuth, widgetsRoutes);
app.use('/api/public', publicChatRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: '接口不存在', code: 'NOT_FOUND', path: req.originalUrl }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const appError = asAppError(error);
  if (!appError.expose) console.error('服务器错误:', error instanceof Error ? error.message : error);
  res.status(appError.status || 500).json({ success: false, message: appError.expose ? appError.message : '服务器内部错误', code: appError.code });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`星链云客系统 API 已启动: ${config.port}`);
  console.log(`健康检查: /health；就绪检查: /readyz；实时网关: /ws`);
  if (!process.env.JWT_SECRET) console.warn('JWT_SECRET 未配置，认证接口将在请求时拒绝，不使用默认密钥');
  if (!config.databaseUrl) console.warn('DATABASE_URL 未配置，业务接口将返回数据库未配置');
  startWorker();
});

attach(server);

async function shutdown(signal: string): Promise<void> {
  console.log(`收到 ${signal}，开始优雅退出`);
  stopWorker();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end().catch(() => undefined);
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

export default app;
