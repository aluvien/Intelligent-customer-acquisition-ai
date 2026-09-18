import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Table, Tag, message } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

type Model = { id: string; name: string; provider: string; model: string; configured: boolean; isActive: boolean };

const ModelsPage: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/ai/models'); setModels(response.data.data.models || []); }
    catch (err: any) { const text = err?.response?.data?.message || 'AI 模型状态加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<ThunderboltOutlined />} title="模型配置" subtitle="只展示服务端实际配置的 AI 供应商状态" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="AI 供应商">
      <Table rowKey="id" loading={loading} dataSource={models} locale={{ emptyText: <Empty description="暂无已配置的 AI 供应商" /> }} pagination={false} columns={[{ title: '供应商', dataIndex: 'name' }, { title: '模型标识', dataIndex: 'model' }, { title: '状态', dataIndex: 'configured', render: (value: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? '已配置' : '未配置'}</Tag> }, { title: '草稿生成', dataIndex: 'isActive', render: (value: boolean) => <Tag color={value ? 'success' : 'warning'}>{value ? '可用' : '不可用'}</Tag> }]} />
      <Alert type="info" showIcon style={{ marginTop: 16 }} message="AI 只生成草稿" description="未配置供应商、知识库为空或供应商返回不完整时，任务会记录为 blocked/failed，不会生成固定兜底话术。" />
    </Card>
  </div>;
};

export default ModelsPage;
