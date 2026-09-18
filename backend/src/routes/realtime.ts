import express from 'express';
import { issueRealtimeTicket } from '../realtime/tickets';

const router = express.Router();

// GET /api/ws/ticket —— 用登录 JWT 换一次性 WS 凭证（60 秒有效，一次有效）
// 挂载时已加 requireAuth，此处直接取 req.user
router.get('/ticket', async (req, res, next) => {
  try {
    if (!req.auth) return res.status(401).json({ success: false, message: '未提供认证令牌' });
    const ticket = await issueRealtimeTicket({ ...req.auth });
    return res.json({ success: true, message: '获取连接凭证成功', data: { ticket, expiresIn: 60 } });
  } catch (error) {
    return next(error);
  }
});

export default router;
