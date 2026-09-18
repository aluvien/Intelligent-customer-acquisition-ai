import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type AiDraft = {
  aiRunId: string;
  conversationId: string;
  draft: string;
  evidence?: Array<{ title: string; version?: number }>;
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
  const [drafts, setDrafts] = useState<Record<string, AiDraft>>({});
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messageIds = useRef<Set<string>>(new Set());
  const conversationIds = useRef<Set<string>>(new Set());
  const pendingMessageKey = useRef<{ key: string; content: string } | null>(null);
  const selectedConversationId = useRef<string | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const inputRevision = useRef(0);
  const messageRequestId = useRef(0);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/conversations', { params: { status: status === 'all' ? undefined : status, limit: 100 } });
      const nextConversations: Conversation[] = response.data.data.conversations || [];
      conversationIds.current = new Set(nextConversations.map((item) => item.id));
      setConversations(nextConversations);
    } catch (err: any) {
      setError(err?.response?.data?.message || '对话数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  const loadMessages = useCallback(async (conversation: Conversation, before?: string) => {
    const requestId = before ? messageRequestId.current : ++messageRequestId.current;
    if (!before) {
      pendingMessageKey.current = null;
      messageIds.current = new Set();
      selectedConversationId.current = conversation.id;
      selectedConversationRef.current = conversation;
      setSelected(conversation);
      setDetailLoading(true);
    }
    try {
      const response = await api.get(`/conversations/${conversation.id}/messages`, { params: before ? { before } : undefined });
      const nextMessages: ConversationMessage[] = response.data.data.messages || [];
      if (requestId === messageRequestId.current) {
        nextMessages.forEach((item) => messageIds.current.add(item.id));
        if (before) {
          setMessages((items) => {
            const merged = new Map(items.map((item) => [item.id, item]));
            nextMessages.forEach((item) => merged.set(item.id, item));
            return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
          });
        } else {
          setMessages(nextMessages);
        }
        setHistoryHasMore(Boolean(response.data.data.pagination?.hasMore));
        setHistoryCursor(response.data.data.pagination?.nextBefore || null);
      }
      if (!before) {
        try {
          const draftResponse = await api.get('/ai/runs', { params: { conversationId: conversation.id } });
          if (requestId === messageRequestId.current) {
            const runs: AiDraft[] = (draftResponse.data.data.runs || []).map((run: any) => ({
              aiRunId: run.id,
              conversationId: run.conversationId,
              draft: run.draft,
              evidence: run.evidence,
            }));
            const recoveredIds = new Set(runs.map((run) => run.aiRunId));
            setDrafts((items) => {
              const next = { ...items };
              Object.keys(next).forEach((id) => {
                if (next[id].conversationId === conversation.id && !recoveredIds.has(id)) delete next[id];
              });
              runs.forEach((run) => { if (!next[run.aiRunId]) next[run.aiRunId] = run; });
              return next;
            });
          }
        } catch {
          // Realtime draft notifications remain available if the recovery request fails.
        }
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '消息加载失败');
    } finally {
      if (requestId === messageRequestId.current) setDetailLoading(false);
    }
  }, []);

  const loadOlder = async () => {
    if (!selected || !historyCursor || loadingOlder) return;
    setLoadingOlder(true);
    try { await loadMessages(selected, historyCursor); }
    catch (err: any) { message.error(err?.response?.data?.message || '更早消息加载失败'); }
    finally { setLoadingOlder(false); }
  };

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const disconnect = connectRealtime({
      onEvent: (event) => {
        if (event.type === 'ai_draft') {
          const draft = event.data as AiDraft;
          if (draft?.aiRunId && draft?.conversationId && draft.draft) setDrafts((items) => ({ ...items, [draft.aiRunId]: draft }));
          return;
        }
        if (event.type !== 'message') return;
        const incoming = event.data as ConversationMessage & { conversationId: string };
        const known = messageIds.current.has(incoming.id);
        messageIds.current.add(incoming.id);
        if (conversationIds.current.has(incoming.conversationId)) {
          setConversations((items) => items.map((item) => item.id === incoming.conversationId ? {
            ...item,
            messageCount: known ? item.messageCount : item.messageCount + 1,
            lastMessageAt: incoming.createdAt || new Date().toISOString(),
            latestMessage: { content: incoming.content, direction: incoming.direction },
          } : item));
        } else {
          void loadConversations();
        }
        if (selectedConversationId.current === incoming.conversationId) {
          setMessages((items) => items.some((item) => item.id === incoming.id)
            ? items.map((item) => item.id === incoming.id ? { ...item, ...incoming } : item)
            : [...items, incoming]);
        }
      },
    });
    return disconnect;
  }, [loadConversations]);

  const counts = useMemo(() => ({
    active: conversations.filter((item) => item.status === 'active').length,
    closed: conversations.filter((item) => item.status === 'closed').length,
  }), [conversations]);

  const send = async () => {
    if (!selected || !content.trim()) return;
    const messageContent = content.trim();
    const conversationId = selected.id;
    const submittedRevision = inputRevision.current;
    const pending = pendingMessageKey.current?.content === messageContent
      ? pendingMessageKey.current
      : { key: crypto.randomUUID(), content: messageContent };
    pendingMessageKey.current = pending;
    try {
      const response = await api.post(`/conversations/${selected.id}/messages`, { content: messageContent }, { headers: { 'Idempotency-Key': pending.key } });
      if (pendingMessageKey.current?.key === pending.key) pendingMessageKey.current = null;
      if (inputRevision.current === submittedRevision && selectedConversationId.current === conversationId) setContent('');
      message.success(response.data.message || '回复已进入发送队列');
      if (selectedConversationId.current === conversationId) await loadMessages(selected);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '回复发送失败');
    }
  };

  const approveDraft = async (draft: AiDraft) => {
    const conversationId = draft.conversationId;
    try {
      const response = await api.post(`/conversations/${draft.conversationId}/drafts/${draft.aiRunId}/approve`, { content: draft.draft }, { headers: { 'Idempotency-Key': `approve-${draft.aiRunId}` } });
      message.success(response.data.message || '草稿已批准');
      setDrafts((items) => { const next = { ...items }; delete next[draft.aiRunId]; return next; });
      if (selectedConversationId.current === conversationId && selectedConversationRef.current) await loadMessages(selectedConversationRef.current);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '草稿批准失败');
    }
  };

  const close = async () => {
    if (!selected) return;
    const conversationId = selected.id;
    try {
      await api.put(`/conversations/${conversationId}/close`);
      message.success('对话已关闭');
      await loadConversations();
      if (selectedConversationId.current !== conversationId) return;
      setSelected((item) => {
        if (!item || item.id !== conversationId) return item;
        const closed = { ...item, status: 'closed' };
        selectedConversationRef.current = closed;
        return closed;
      });
    } catch (err: any) {
      message.error(err?.response?.data?.message || '关闭对话失败');
    }
  };

  const selectedDrafts = selected ? Object.values(drafts).filter((draft) => draft.conversationId === selected.id) : [];

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<MessageOutlined />} title="客服工作台" subtitle="真实会话、消息状态与人工接管" extra={<Space><Badge status="processing" text={`${counts.active} 个进行中`} /><Button onClick={() => void loadConversations()}>刷新</Button></Space>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16 }}>
      <Card title="会话列表" extra={<Select value={status} onChange={setStatus} options={[{ value: 'active', label: '进行中' }, { value: 'transferred', label: '已转人工' }, { value: 'closed', label: '已关闭' }, { value: 'all', label: '全部' }]} style={{ width: 110 }} />}>
        {loading ? <Spin /> : conversations.length === 0 ? <Empty description="暂无真实会话" /> : <List dataSource={conversations} renderItem={(item) => <List.Item onClick={() => void loadMessages(item)} style={{ cursor: 'pointer', background: selected?.id === item.id ? BUSINESS_THEME.primaryActiveBg : undefined, padding: 12, borderRadius: 8 }}>
          <List.Item.Meta avatar={<Badge dot={item.status === 'active'}><UserOutlined /></Badge>} title={<Space><span>{item.userNickname}</span><Tag>{item.mode === 'human' ? '人工' : item.mode === 'auto' ? '自动' : 'AI草稿'}</Tag></Space>} description={<Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{item.latestMessage?.content || '暂无消息'}<br /><Typography.Text type="secondary">{item.messageCount} 条 · {new Date(item.lastMessageAt).toLocaleString()}</Typography.Text></Typography.Paragraph>} />
        </List.Item>} />}
      </Card>
      <Card title={selected ? `${selected.userNickname} · ${selected.status}` : '选择一个会话'} extra={selected && <Space><Button danger icon={<CloseCircleOutlined />} onClick={() => void close()} disabled={selected.status === 'closed'}>关闭</Button><Select value={selected.mode} onChange={async (mode) => { try { await api.put(`/conversations/${selected.id}/mode`, { mode }); setSelected({ ...selected, mode }); await loadConversations(); } catch (err: any) { message.error(err?.response?.data?.message || '会话模式更新失败'); } }} options={[{ value: 'human', label: '人工接管' }, { value: 'ai_draft', label: 'AI草稿' }, { value: 'auto', label: '自动回复（管理员）' }]} style={{ width: 150 }} /></Space>}>
        {!selected ? <Empty description="选择会话查看历史" /> : detailLoading ? <Spin /> : <>
          {selectedDrafts.map((draft) => <Alert key={draft.aiRunId} type="info" showIcon style={{ marginBottom: 12 }} message="AI 草稿（需人工批准）" description={<><Input.TextArea value={draft.draft} onChange={(event) => setDrafts((items) => ({ ...items, [draft.aiRunId]: { ...draft, draft: event.target.value } }))} autoSize={{ minRows: 2, maxRows: 5 }} /><Button type="primary" style={{ marginTop: 8 }} onClick={() => void approveDraft(draft)}>批准并发送</Button></>} />)}
          {historyHasMore && <Button loading={loadingOlder} onClick={() => void loadOlder()} style={{ marginBottom: 8 }}>加载更早消息</Button>}
          <div style={{ height: 420, overflowY: 'auto', padding: '8px 0' }}>{messages.map((item) => <div key={item.id} style={{ display: 'flex', justifyContent: item.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 12 }}><div style={{ maxWidth: '72%', padding: '10px 12px', borderRadius: 10, background: item.direction === 'outbound' ? BUSINESS_THEME.primary : '#f4f6f8', color: item.direction === 'outbound' ? '#fff' : '#1A2332' }}><div>{item.content}</div><Typography.Text style={{ fontSize: 11, color: item.direction === 'outbound' ? 'rgba(255,255,255,.75)' : '#778' }}>{new Date(item.createdAt).toLocaleString()} · {item.deliveryStatus}</Typography.Text></div></div>)}</div>
          <Space.Compact style={{ width: '100%' }}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={content} onChange={(event) => { inputRevision.current += 1; setContent(event.target.value); }} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="输入人工回复，Enter 发送，Shift+Enter 换行" /><Button type="primary" icon={<SendOutlined />} onClick={() => void send()}>发送</Button></Space.Compact>
        </>}
      </Card>
    </div>
  </div>;
};

export default ActiveConversations;
