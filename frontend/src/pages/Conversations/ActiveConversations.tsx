import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Input, List, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { CloseCircleOutlined, MessageOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { connectRealtime } from '../../services/realtime';
import BusinessPageHeader from '../../components/BusinessPageHeader';
import { BUSINESS_THEME } from '../../config/brand';

type Conversation = {
  id: string;
  userNickname: string;
  userId: string;
  status: string;
  mode: string;
  messageCount: number;
  lastMessageAt: string;
  latestMessage?: { content: string; direction: string } | null;
};

type ConversationMessage = {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  senderType: 'visitor' | 'human' | 'ai';
  deliveryStatus: string;
  createdAt: string;
};

const ActiveConversations: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/conversations', { params: { status: status === 'all' ? undefined : status, limit: 100 } });
      setConversations(response.data.data.conversations || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || '对话数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadMessages = useCallback(async (conversation: Conversation) => {
    setSelected(conversation);
    setDetailLoading(true);
    try {
      const response = await api.get(`/conversations/${conversation.id}/messages`);
      setMessages(response.data.data.messages || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '消息加载失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const disconnect = connectRealtime({
      onEvent: (event) => {
        if (event.type !== 'message') return;
        const incoming = event.data as ConversationMessage & { conversationId: string };
        setConversations((items) => items.map((item) => item.id === incoming.conversationId ? { ...item, messageCount: item.messageCount + 1, lastMessageAt: incoming.createdAt || new Date().toISOString(), latestMessage: { content: incoming.content, direction: incoming.direction } } : item));
        if (selected?.id === incoming.conversationId) setMessages((items) => items.some((item) => item.id === incoming.id) ? items : [...items, incoming]);
      },
    });
    return disconnect;
  }, [selected?.id]);

  const counts = useMemo(() => ({ active: conversations.filter((item) => item.status === 'active').length, closed: conversations.filter((item) => item.status === 'closed').length }), [conversations]);

  const send = async () => {
    if (!selected || !content.trim()) return;
    try {
      const response = await api.post(`/conversations/${selected.id}/messages`, { content: content.trim() });
      setContent('');
      message.success(response.data.message || '回复已进入发送队列');
      await loadMessages(selected);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '回复发送失败');
    }
  };

  const close = async () => {
    if (!selected) return;
    try {
      await api.put(`/conversations/${selected.id}/close`);
      message.success('对话已关闭');
      await loadConversations();
      setSelected((item) => item ? { ...item, status: 'closed' } : item);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '关闭对话失败');
    }
  };

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<MessageOutlined />} title="客服工作台" subtitle="真实会话、消息状态与人工接管" extra={<Space><Badge status="processing" text={`${counts.active} 个进行中`} /><Button onClick={() => void loadConversations()}>刷新</Button></Space>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16 }}>
      <Card title="会话列表" extra={<Select value={status} onChange={setStatus} options={[{ value: 'active', label: '进行中' }, { value: 'transferred', label: '已转人工' }, { value: 'closed', label: '已关闭' }, { value: 'all', label: '全部' }]} style={{ width: 110 }} />}>
        {loading ? <Spin /> : conversations.length === 0 ? <Empty description="暂无真实会话" /> : <List dataSource={conversations} renderItem={(item) => <List.Item onClick={() => void loadMessages(item)} style={{ cursor: 'pointer', background: selected?.id === item.id ? BUSINESS_THEME.primaryActiveBg : undefined, padding: 12, borderRadius: 8 }}>
          <List.Item.Meta avatar={<Badge dot={item.status === 'active'}><UserOutlined /></Badge>} title={<Space><span>{item.userNickname}</span><Tag>{item.mode === 'human' ? '人工' : item.mode === 'auto' ? '自动' : 'AI草稿'}</Tag></Space>} description={<Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{item.latestMessage?.content || '暂无消息'}<br /><Typography.Text type="secondary">{item.messageCount} 条 · {new Date(item.lastMessageAt).toLocaleString()}</Typography.Text></Typography.Paragraph>} />
        </List.Item>} />}
      </Card>
      <Card title={selected ? `${selected.userNickname} · ${selected.status}` : '选择一个会话'} extra={selected && <Space><Button danger icon={<CloseCircleOutlined />} onClick={() => void close()} disabled={selected.status === 'closed'}>关闭</Button><Select value={selected.mode} onChange={async (mode) => { await api.put(`/conversations/${selected.id}/mode`, { mode }); setSelected({ ...selected, mode }); }} options={[{ value: 'human', label: '人工接管' }, { value: 'ai_draft', label: 'AI草稿' }, { value: 'auto', label: '自动回复（管理员）' }]} style={{ width: 150 }} /></Space>}>
        {!selected ? <Empty description="选择会话查看历史" /> : detailLoading ? <Spin /> : <>
          <div style={{ height: 420, overflowY: 'auto', padding: '8px 0' }}>{messages.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: item.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 12 }}><div style={{ maxWidth: '72%', padding: '10px 12px', borderRadius: 10, background: item.direction === 'outbound' ? BUSINESS_THEME.primary : '#f4f6f8', color: item.direction === 'outbound' ? '#fff' : '#1A2332' }}><div>{item.content}</div><Typography.Text style={{ fontSize: 11, color: item.direction === 'outbound' ? 'rgba(255,255,255,.75)' : '#778' }}>{new Date(item.createdAt).toLocaleString()} · {item.deliveryStatus}</Typography.Text></div></div>)}</div>
          <Space.Compact style={{ width: '100%' }}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={content} onChange={(event) => setContent(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="输入人工回复，Enter 发送，Shift+Enter 换行" /><Button type="primary" icon={<SendOutlined />} onClick={() => void send()}>发送</Button></Space.Compact>
        </>}
      </Card>
    </div>
  </div>;
};

export default ActiveConversations;
