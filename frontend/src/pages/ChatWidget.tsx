import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Space, Typography, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import api from '../services/api';

type Session = { sessionId: string; token: string; visitorId: string };
type ChatMessage = { id: string; direction: 'inbound' | 'outbound'; senderType: string; content: string; deliveryStatus: string; createdAt: string };

const ChatWidget: React.FC = () => {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadForm] = Form.useForm();
  const pendingMessageKey = useRef<string | null>(null);

  const loadMessages = useCallback(async (current: Session) => {
    const response = await api.get(`/public/sessions/${current.sessionId}/messages`, { headers: { 'X-Visitor-Token': current.token } });
    setMessages(response.data.data.messages || []);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!widgetId) return;
      try {
        const key = `visitor-session:${widgetId}`;
        const stored = sessionStorage.getItem(key);
        const current: Session = stored ? JSON.parse(stored) : (await api.post(`/public/widgets/${widgetId}/sessions`)).data.data;
        if (!stored) sessionStorage.setItem(key, JSON.stringify(current));
        if (!active) return;
        setSession(current);
        await loadMessages(current);
      } catch (err: any) { if (active) setError(err?.response?.data?.message || '访客入口暂不可用'); }
      finally { if (active) setLoading(false); }
    };
    void init();
    return () => { active = false; };
  }, [widgetId, loadMessages]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => { void loadMessages(session).catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, [session, loadMessages]);

  const send = async () => {
    if (!session || !content.trim()) return;
    const idempotencyKey = pendingMessageKey.current || crypto.randomUUID();
    pendingMessageKey.current = idempotencyKey;
    try { await api.post(`/public/sessions/${session.sessionId}/messages`, { content: content.trim() }, { headers: { 'X-Visitor-Token': session.token, 'Idempotency-Key': idempotencyKey } }); pendingMessageKey.current = null; setContent(''); await loadMessages(session); }
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
      <div style={{ minHeight: 360, maxHeight: 520, overflowY: 'auto', padding: 8 }}>{messages.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: item.direction === 'outbound' ? 'flex-start' : 'flex-end', marginBottom: 12 }}><div style={{ maxWidth: '75%', padding: '10px 12px', borderRadius: 10, background: item.direction === 'outbound' ? '#eef6f3' : '#0e7c6b', color: item.direction === 'outbound' ? '#1a2332' : '#fff' }}>{item.content}<div style={{ fontSize: 11, opacity: .7, marginTop: 4 }}>{new Date(item.createdAt).toLocaleTimeString()} · {item.deliveryStatus}</div></div></div>)}</div>
      <Space.Compact style={{ width: '100%' }}><Input.TextArea value={content} onChange={(event) => setContent(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(); } }} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="请输入您的问题" /><Button type="primary" icon={<SendOutlined />} onClick={() => void send()}>发送</Button></Space.Compact>
    </>}
    {leadOpen && <Form form={leadForm} layout="vertical" style={{ marginTop: 16 }}><Form.Item name="phone" label="手机号"><Input /></Form.Item><Form.Item name="email" label="邮箱"><Input /></Form.Item><Form.Item name="consent" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('请确认同意提交联系方式')) }]}><Checkbox>我同意提交联系方式，供客服联系我</Checkbox></Form.Item><Button type="primary" onClick={() => void submitLead()}>提交联系方式</Button></Form>}
  </Card></div>;
};

export default ChatWidget;
