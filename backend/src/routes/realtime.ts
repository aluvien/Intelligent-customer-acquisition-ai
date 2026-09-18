import express from 'express';

const router = express.Router();

// GET /api/ws/ticket —— 用登录 JWT 换一次性 WS 凭证（60 秒有效，一次有效）
// 挂载时已加 requireAuth，此处直接取 req.user
router.get('/ticket', (req, res) => {
  const user = (req as any).user;
  if (!user || !user.userId) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌',
    });
  }

  const { issueTicket } = require('../realtime/hub');
  return res.json({
    success: true,
    message: '获取连接凭证成功',
    data: {
      ticket: issueTicket({ userId: user.userId, tenantId: user.tenantId }),
      expiresIn: 60,
    },
  });
});

module.exports = router;
