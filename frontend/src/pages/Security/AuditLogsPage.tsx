import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, message } from 'antd';
import { ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/system/logs', { params: { limit: 100 } }); setLogs(response.data.data.logs || []); }
    catch (err: any) { const text = err?.response?.data?.message || '审计日志加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<SafetyOutlined />} title="审计记录" subtitle="只展示当前企业持久化的操作记录" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="操作审计"><Table rowKey="id" loading={loading} dataSource={logs} locale={{ emptyText: <Empty description="暂无审计记录" /> }} columns={[{ title: '动作', dataIndex: 'action' }, { title: '资源', render: (_: unknown, row: any) => `${row.resourceType}${row.resourceId ? ` · ${row.resourceId}` : ''}` }, { title: '操作者', dataIndex: 'userId' }, { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }, { title: '元数据', dataIndex: 'metadata', render: (value: unknown) => <code>{JSON.stringify(value || {})}</code> }]} /></Card>
  </div>;
};

export default AuditLogsPage;
