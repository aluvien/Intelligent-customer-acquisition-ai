import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Spin, Tag, message } from 'antd';
import { MonitorOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

type Monitoring = { uptimeSeconds: number; memoryRssBytes: number; heapUsedBytes: number; database: string; nodeEnv: string };

const MonitoringPage: React.FC = () => {
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/system/monitoring'); setData(response.data.data); }
    catch (err: any) { const text = err?.response?.data?.message || '监控状态加载失败'; setError(text); message.error(text); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<MonitorOutlined />} title="运行监控" subtitle="展示当前 Node 服务和数据库的真实状态" extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card>{loading && !data ? <Spin /> : data && <Descriptions bordered column={1}>
      <Descriptions.Item label="运行环境"><Tag>{data.nodeEnv}</Tag></Descriptions.Item>
      <Descriptions.Item label="进程运行时间">{Math.floor(data.uptimeSeconds / 60)} 分钟</Descriptions.Item>
      <Descriptions.Item label="数据库"><Tag color={data.database === 'ready' ? 'success' : 'error'}>{data.database}</Tag></Descriptions.Item>
      <Descriptions.Item label="RSS 内存">{(data.memoryRssBytes / 1024 / 1024).toFixed(1)} MB</Descriptions.Item>
      <Descriptions.Item label="Heap 已使用">{(data.heapUsedBytes / 1024 / 1024).toFixed(1)} MB</Descriptions.Item>
    </Descriptions>}</Card>
  </div>;
};

export default MonitoringPage;
