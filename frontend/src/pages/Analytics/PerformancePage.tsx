import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, message } from 'antd';
import { BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const PerformancePage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/analytics/performance'); setRows(response.data.data.performance || []); }
    catch (err: any) { const text = err?.response?.data?.message || '客服绩效加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<BarChartOutlined />} title="客服绩效" subtitle="统计当前企业已分配的会话与线索，不填充虚构指标" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="客服数据"><Table rowKey="agentId" loading={loading} dataSource={rows} locale={{ emptyText: <Empty description="暂无已分配的客服数据" /> }} pagination={false} columns={[{ title: '客服', dataIndex: 'agent' }, { title: '会话', dataIndex: 'conversations' }, { title: '线索', dataIndex: 'leads' }]} /></Card>
  </div>;
};

export default PerformancePage;
