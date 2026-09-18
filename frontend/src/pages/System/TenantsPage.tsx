import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, Tag, message } from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const TenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/system/tenants'); setTenants(response.data.data.tenants || []); }
    catch (err: any) { const text = err?.response?.data?.message || '企业信息加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<UserOutlined />} title="企业信息" subtitle="当前账号可访问的租户记录" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="租户列表"><Table rowKey="id" loading={loading} dataSource={tenants} locale={{ emptyText: <Empty description="暂无企业记录" /> }} pagination={false} columns={[{ title: '企业名称', dataIndex: 'name' }, { title: '套餐', dataIndex: 'plan' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'active' ? 'success' : 'error'}>{value}</Tag> }, { title: '到期时间', dataIndex: 'expiresAt', render: (value: string | null) => value ? new Date(value).toLocaleString() : '未设置' }, { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }]} /></Card>
  </div>;
};

export default TenantsPage;
