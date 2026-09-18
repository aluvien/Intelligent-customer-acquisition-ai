import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, message } from 'antd';
import { BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const ChannelsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/analytics/channels'); setRows(response.data.data.channels || []); }
    catch (err: any) { const text = err?.response?.data?.message || '渠道分析加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<BarChartOutlined />} title="渠道对比分析" subtitle="统计当前企业已持久化的会话与客户主动留资" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="渠道数据"><Table rowKey="channelId" loading={loading} dataSource={rows} locale={{ emptyText: <Empty description="暂无真实渠道数据" /> }} pagination={false} columns={[{ title: '渠道', dataIndex: 'channelName' }, { title: '会话', dataIndex: 'conversations' }, { title: '留资', dataIndex: 'leads' }, { title: '留资/会话', dataIndex: 'conversionRate', render: (value: number) => `${value || 0}%` }]} /></Card>
  </div>;
};

export default ChannelsPage;
