import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, Tag, Typography, message } from 'antd';
import { GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const DouyinPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get('/channels'); setAccounts((response.data.data.channels || []).filter((item: any) => item.type === 'douyin')); }
    catch (err: any) { message.error(err?.response?.data?.message || '渠道加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<GlobalOutlined />} title="抖音渠道" subtitle="只展示已持久化的账号状态；当前应用的抖音权限尚未完成真实核验" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    <Alert type="warning" showIcon message="平台能力未验证" description="当前不会模拟 OAuth、连接、评论读取或回复成功。完成官方权限审批、账号授权和一次真实测试后，才会启用该渠道。" style={{ marginBottom: 16 }} />
    <Card title="抖音账号"><Table rowKey="id" loading={loading} dataSource={accounts} locale={{ emptyText: <Empty description="暂无已核验的抖音账号" /> }} columns={[{ title: '账号', dataIndex: 'accountName' }, { title: '外部账号 ID', dataIndex: 'accountId' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> }, { title: '能力', dataIndex: 'capability', render: () => <Tag color="orange">unverified</Tag> }, { title: '最近事件', dataIndex: 'lastHeartbeat', render: (value: string | null) => value ? new Date(value).toLocaleString() : '无真实事件' }]} /></Card>
    <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>抖音接入的审计证据位于 <code>docs/rebuild/DOUYIN_CAPABILITY_MATRIX.md</code>；没有真实凭据时不会把平台支线标记为完成。</Typography.Paragraph>
  </div>;
};

export default DouyinPage;
