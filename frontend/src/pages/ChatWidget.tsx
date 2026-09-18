import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Space, Typography, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import api from '../services/api';

type Session = { sessionId: string; token: string; visitorId: string; expiresAt?: number };
type ChatMessage = { id: string; direction: 'inbound' | 'outbound'; senderType: string; content: string; deliveryStatus: string; createdAt: string };

const ChatWidget: React.FC = () => {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [leadForm] = Form.useForm();
  const pendingMessageKey = useRef<{ key: string; content: string } | null>(null);
  const inputRevision = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const sessionGeneration = useRef(0);
  const sessionRecovery = useRef<Promise<Session> | null>(null);

  const createSession = useCallback(async (): Promise<Session> => {
    if (!widgetId) throw new Error('访客入口不存在');
    const response = await api.post(`/public/widgets/${widgetId}/sessions`);
    const next = response.data.data as Session & { expiresInHours?: number };
    return { ...next, expiresAt: Date.now() + Number(next.expiresInHours || 24) * 60 * 60 * 1000 };
  }, [widgetId]);

  const loadMessages = useCallback(async (current: Session, before?: string, replace = false) => {
    const requestGeneration = sessionGeneration.current;
    const response = await api.get(`/public/sessions/${current.sessionId}/messages`, { params: before ? { before } : undefined, headers: { 'X-Visitor-Token': current.token } });
    if (sessionGeneration.current !== requestGeneration || sessionRef.current?.sessionId !== current.sessionId) return;
    const nextMessages: ChatMessage[] = response.data.data.messages || [];
    if (before) {
      setMessages((items) => {
        const merged = new Map(items.map((item) => [item.id, item]));
        nextMessages.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      });
    } else {
      setMessages((items) => {
        if (replace || items.length === 0) return nextMessages;
        const merged = new Map(items.map((item) => [item.id, item]));
        nextMessages.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      });
    }
    const nextHasMore = Boolean(response.data.data.pagination?.hasMore);
    const nextCursor = response.data.data.pagination?.nextBefore || null;
    setHistoryHasMore((currentValue) => before || replace || !currentValue ? nextHasMore : currentValue || nextHasMore);
    setHistoryCursor((currentValue) => before || replace || !currentValue ? nextCursor : currentValue || nextCursor);
  }, []);

  const recoverSession = useCallback(async (): Promise<Session> => {
    if (!widgetId) throw new Error('访客入口不存在');
    if (sessionRecovery.current) return sessionRecovery.current;
    const key = `visitor-session:${widgetId}`;
    const recovery = (async () => {
      sessionStorage.removeItem(key);
      const replacement = await createSession();
      sessionStorage.setItem(key, JSON.stringify(replacement));
      sessionGeneration.current += 1;
      sessionRef.current = replacement;
      setSession(replacement);
      setMessages([]);
      setHistoryCursor(null);
      setHistoryHasMore(false);
      await loadMessages(replacement, undefined, true);
      return replacement;
    })();
    sessionRecovery.current = recovery;
    try {
      return await recovery;
    } finally {
      if (sessionRecovery.current === recovery) sessionRecovery.current = null;
    }
  }, [widgetId, createSession, loadMessages]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!widgetId) return;
      try {
        const key = `visitor-session:${widgetId}`;
        const rawStored = sessionStorage.getItem(key);
        let current: Session | null = null;
        if (rawStored) {
          try {
            const stored = JSON.parse(rawStored) as Session;
            if (!stored.expiresAt || stored.expiresAt > Date.now()) current = stored;
            else sessionStorage.removeItem(key);
          } catch { sessionStorage.removeItem(key); }
        }
        if (!current) {
          current = await createSession();
          sessionStorage.setItem(key, JSON.stringify(current));
        }
        if (!active) return;
        sessionGeneration.current += 1;
        sessionRef.current = current;
        setSession(current);
        try {
          await loadMessages(current, undefined, true);
        } catch (err: any) {
          if (err?.response?.status !== 401) throw err;
          if (active) await recoverSession();
        }
      } catch (err: any) { if (active) setError(err?.response?.data?.message || '访客入口暂不可用'); }
      finally { if (active) setLoading(false); }
    };
    void init();
    return () => { active = false; };
  }, [widgetId, createSession, loadMessages, recoverSession]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadMessages(session).catch(async (err: any) => {
        if (err?.response?.status !== 401 || !widgetId) return;
        try {
          await recoverSession();
        } catch { /* The next poll or a user action will surface the error. */ }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [session, widgetId, recoverSession, loadMessages]);

  const loadOlder = async () => {
    if (!session || !historyCursor || loadingOlder) return;
    setLoadingOlder(true);
    try { await loadMessages(session, historyCursor); }
    catch (err: any) { message.error(err?.response?.data?.message || '更早消息加载失败'); }
    finally { setLoadingOlder(false); }
  };

  const send = async () => {
    if (!session || !content.trim()) return;
    const messageContent = content.trim();
    const submittedRevision = inputRevision.current;
    const pending = pendingMessageKey.current?.content === messageContent
      ? pendingMessageKey.current
      : { key: crypto.randomUUID(), content: messageContent };
    pendingMessageKey.current = pending;
    try {
      await api.post(`/public/sessions/${session.sessionId}/messages`, { content: messageContent }, { headers: { 'X-Visitor-Token': session.token, 'Idempotency-Key': pending.key } });
      if (pendingMessageKey.current?.key === pending.key) pendingMessageKey.current = null;
      if (inputRevision.current === submittedRevision) setContent('');
      await loadMessages(session);
    }
    catch (err: any) { message.error(err?.response?.data?.message || '消息发送失败'); }
  };

  const submitLead = async () => {
    if (!session) return;
    try { await leadForm.validateFields(); await api.post(`/public/sessions/${session.sessionId}/lead`, leadForm.getFieldsValue(), { headers: { 'X-Visitor-Token': session.token } }); message.success('联系方式已提交，客服会尽快联系您'); setLeadOpen(false); leadForm.resetFields(); }
    catch (err: any) { if (!err?.errorFields) message.error(err?.response?.data?.message || '联系方式提交失败'); }
  };

  return <div style={{ minHeight: '100vh', background: '#f4f7f6', padding: 24 }}><Card title="在线咨询" style={{ maxWidth: 680, margin: '0 auto' }} extra={<Button onClick={() => setLeadOpen((value) => !value)}>留下联系方式</Button>}>
    {error && <Alert type="error" showIcon message={error} />}
    {loading ? <Typography.Paragraph>正在建立访客会话…</Typography.Paragraph> : <>
      {historyHasMore && <Button loading={loadingOlder} onClick={() => void loadOlder()} style={{ marginBottom: 8 }}>加载更早消息</Button>}
      <div style={{ minHeight: 360, maxHeight: 520, overflowY: 'auto', padding: 8 }}>{messages.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: item.direction === 'outbound' ? 'flex-start' : 'flex-end', marginBottom: 12 }}><div style={{ maxWidth: '75%', padding: '10px 12px', borderRadius: 10, background: item.direction === 'outbound' ? '#eef6f3' : '#0e7c6b', color: item.direction === 'outbound' ? '#1a2332' : '#fff' }}>{item.content}<div style={{ fontSize: 11, opacity: .7, marginTop: 4 }}>{new Date(item.createdAt).toLocaleTimeString()} · {item.deliveryStatus}</div></div></div>)}</div>
      <Space.Compact style={{ width: '100%' }}><Input.TextArea value={content} onChange={(event) => { inputRevision.current += 1; setContent(event.target.value); }} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="请输入您的问题" /><Button type="primary" icon={<SendOutlined />} onClick={() => void send()}>发送</Button></Space.Compact>
    </>}
    {leadOpen && <Form form={leadForm} layout="vertical" style={{ marginTop: 16 }}><Form.Item name="phone" label="手机号"><Input /></Form.Item><Form.Item name="email" label="邮箱"><Input /></Form.Item><Form.Item name="consent" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('请确认同意提交联系方式')) }]}><Checkbox>我同意提交联系方式，供客服联系我</Checkbox></Form.Item><Button type="primary" onClick={() => void submitLead()}>提交联系方式</Button></Form>}
  </Card></div>;
};

export default ChatWidget;
