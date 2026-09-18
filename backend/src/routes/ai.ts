import express from 'express';
import { query, withTransaction } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { insertJob } from '../jobs/worker';
import { requireRole } from '../middleware/auth';
import { requireText, tenantId } from './helpers';

const router = express.Router();

router.get('/knowledge', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, title, content, version, status, created_by AS "createdBy", published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM knowledge_documents WHERE tenant_id = $1 ORDER BY updated_at DESC`, [tenantId(req)]);
    res.json({ success: true, message: '获取企业知识成功', data: { documents: result.rows } });
  } catch (error) { next(error); }
});

router.post('/knowledge', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const title = requireText(req.body?.title, '标题', 200);
    const content = requireText(req.body?.content, '内容', 50_000);
    const result = await query(`INSERT INTO knowledge_documents(id, tenant_id, title, content, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, content, version, status, created_at AS "createdAt", updated_at AS "updatedAt"`, [randomId(), tenantId(req), title, content, req.auth!.userId]);
    res.status(201).json({ success: true, message: '知识文档已保存为草稿', data: { document: result.rows[0] } });
  } catch (error) { next(error); }
});

router.patch('/knowledge/:id', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : undefined;
    if (!title && !content) throw new AppError(400, 'NO_CHANGES', '没有可更新字段');
    const result = await query(`UPDATE knowledge_documents SET title = COALESCE($1, title), content = COALESCE($2, content), version = version + 1, status = CASE WHEN status = 'published' THEN 'draft' ELSE status END, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING id, title, content, version, status, updated_at AS "updatedAt"`, [title || null, content || null, req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'KNOWLEDGE_NOT_FOUND', '知识文档不存在');
    res.json({ success: true, message: '知识文档已更新，需要重新发布', data: { document: result.rows[0] } });
  } catch (error) { next(error); }
});

router.post('/knowledge/:id/publish', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query(`UPDATE knowledge_documents SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND length(trim(content)) > 0 RETURNING id, title, version, status, published_at AS "publishedAt"`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'KNOWLEDGE_NOT_FOUND', '知识文档不存在或内容为空');
    res.json({ success: true, message: '知识文档已发布', data: { document: result.rows[0] } });
  } catch (error) { next(error); }
});

router.delete('/knowledge/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query(`UPDATE knowledge_documents SET status = 'archived', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'KNOWLEDGE_NOT_FOUND', '知识文档不存在');
    res.json({ success: true, message: '知识文档已归档', data: { id: req.params.id } });
  } catch (error) { next(error); }
});

router.post('/draft', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const conversationId = requireText(req.body?.conversationId, 'conversationId', 100);
    const messageId = requireText(req.body?.messageId, 'messageId', 100);
    const tenant = tenantId(req);
    const result = await withTransaction(async (client) => {
      const conversation = await client.query<{ id: string; mode_version: number }>('SELECT id, mode_version FROM conversations WHERE id = $1 AND tenant_id = $2 FOR SHARE', [conversationId, tenant]);
      if (!conversation.rowCount) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
      const message = await client.query<{ id: string }>('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2 AND tenant_id = $3 AND direction = \'inbound\'', [messageId, conversationId, tenant]);
      if (!message.rowCount) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'AI 输入消息不存在或不属于该对话');
      const aiRunId = randomId();
      await client.query(`INSERT INTO ai_runs(id, tenant_id, conversation_id, message_id, provider, status) VALUES ($1, $2, $3, $4, $5, 'queued')`, [aiRunId, tenant, conversationId, messageId, process.env.AI_PROVIDER || 'coze']);
      await insertJob(client, tenant, 'ai_draft', { conversationId, messageId, aiRunId, modeVersion: conversation.rows[0].mode_version });
      return { aiRunId };
    });
    res.status(202).json({ success: true, message: 'AI 草稿任务已创建', data: { aiRunId: result.aiRunId, status: 'queued' } });
  } catch (error) { next(error); }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, conversation_id AS "conversationId", message_id AS "messageId", provider, status, draft, evidence, usage, error, trace_id AS "traceId", created_at AS "createdAt", completed_at AS "completedAt" FROM ai_runs WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'AI_RUN_NOT_FOUND', 'AI 任务不存在');
    res.json({ success: true, message: '获取 AI 任务成功', data: { run: result.rows[0] } });
  } catch (error) { next(error); }
});

router.get('/models', async (_req, res) => {
  const configured = Boolean(process.env.COZE_TOKEN && process.env.COZE_BOT_ID && process.env.COZE_API_URL);
  res.json({ success: true, message: '获取 AI 模型配置成功', data: { models: [{ id: 'coze', name: 'Coze', provider: 'coze', model: process.env.COZE_BOT_ID ? 'configured-bot' : 'not-configured', isActive: configured, configured }] } });
});

router.get('/stats', async (req, res, next) => {
  try {
    const result = await query<{ total: string; succeeded: string; failed: string; blocked: string }>(`SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'succeeded')::text AS succeeded, COUNT(*) FILTER (WHERE status = 'failed')::text AS failed, COUNT(*) FILTER (WHERE status = 'blocked')::text AS blocked FROM ai_runs WHERE tenant_id = $1`, [tenantId(req)]);
    res.json({ success: true, message: '获取 AI 统计成功', data: result.rows[0] || { total: '0', succeeded: '0', failed: '0', blocked: '0' } });
  } catch (error) { next(error); }
});

router.post('/audit', async (req, res, next) => {
  try {
    const content = requireText(req.body?.content, '内容', 10_000);
    const words = (process.env.CONTENT_BLOCK_WORDS || '').split(',').map((word) => word.trim()).filter(Boolean);
    const detectedWords = words.filter((word) => content.includes(word));
    res.json({ success: true, message: '内容审核完成', data: { isBlocked: detectedWords.length > 0, detectedWords, action: detectedWords.length > 0 ? 'block' : 'pass', confidence: null } });
  } catch (error) { next(error); }
});

router.get('/intents', (_req, res) => res.status(501).json({ success: false, message: '意图规则模块尚未接入持久化实现，请使用企业知识草稿流程', code: 'FEATURE_NOT_IMPLEMENTED' }));
router.post('/intents', (_req, res) => res.status(501).json({ success: false, message: '意图规则模块尚未接入持久化实现', code: 'FEATURE_NOT_IMPLEMENTED' }));

export default router;
