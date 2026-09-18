import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Spin, Statistic, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';
import { BUSINESS_THEME } from '../../config/brand';

type Channel = {
  id: string;
  type: string;
  name: string;
  status: 'authorized' | 'subscribed' | 'error' | 'disabled' | 'unconfigured' | string;
  lastHeartbeat: string | null;
  capability: 'verified' | 'unverified' | string;
};

const platformLabels: Record<string, string> = {
  web: '在线咨询',
  douyin: '抖音',
  kuaishou: '快手',
  wechat: '视频号',
  xiaohongshu: '小红书',
};

function statusMeta(status: string): { badge: 'success' | 'processing' | 'error' | 'warning' | 'default'; label: string } {
  if (status === 'subscribed') return { badge: 'success', label: '已订阅' };
  if (status === 'authorized') return { badge: 'processing', label: '已授权' };
  if (status === 'error') return { badge: 'error', label: '异常' };
  if (status === 'unconfigured') return { badge: 'warning', label: '未配置' };
  if (status === 'disabled') return { badge: 'default', label: '已停用' };
  return { badge: 'default', label: status || '未知' };
}

const StatusPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/channels');
      setChannels(response.data.data.channels || []);
    } catch (err: any) {
      const text = err?.response?.data?.message || '渠道状态加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const healthy = channels.filter((channel) => ['authorized', 'subscribed'].includes(channel.status)).length;
  const errors = channels.filter((channel) => channel.status === 'error').length;
  const inactive = channels.filter((channel) => ['disabled', 'unconfigured'].includes(channel.status)).length;

  return (
    <div style={{ padding: '4px 0' }}>
      <BusinessPageHeader
        icon={<GlobalOutlined />}
        title="渠道状态监控"
        subtitle="只展示当前企业数据库中的渠道账号状态，不生成虚构的在线率或心跳"
        extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>}
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {loading && !channels.length ? <Spin /> : <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8} lg={6}><Card><Statistic title="正常渠道" value={healthy} prefix={<CheckCircleOutlined style={{ color: '#12A086' }} />} valueStyle={{ color: '#12A086' }} /></Card></Col>
          <Col xs={24} sm={8} lg={6}><Card><Statistic title="异常渠道" value={errors} prefix={<WarningOutlined style={{ color: '#D97706' }} />} valueStyle={{ color: '#D97706' }} /></Card></Col>
          <Col xs={24} sm={8} lg={6}><Card><Statistic title="未启用渠道" value={inactive} prefix={<CloseCircleOutlined style={{ color: '#E5484D' }} />} valueStyle={{ color: '#E5484D' }} /></Card></Col>
          <Col xs={24} sm={8} lg={6}><Card><Statistic title="总渠道数" value={channels.length} prefix={<GlobalOutlined style={{ color: BUSINESS_THEME.primary }} />} valueStyle={{ color: BUSINESS_THEME.primary }} /></Card></Col>
        </Row>
        <Card title="渠道状态详情">
          <List
            loading={loading}
            dataSource={channels}
            locale={{ emptyText: <Empty description="暂无持久化渠道账号" /> }}
            renderItem={(channel) => {
              const meta = statusMeta(channel.status);
              return (
                <List.Item>
                  <List.Item.Meta
                    title={<Space><span>{channel.name || platformLabels[channel.type] || channel.type}</span><Tag color={meta.badge === 'error' ? 'error' : meta.badge === 'success' ? 'success' : 'default'}>{meta.label}</Tag></Space>}
                    description={<Typography.Text type="secondary">平台：{platformLabels[channel.type] || channel.type} · 能力：{channel.capability} · 最近真实事件：{channel.lastHeartbeat ? new Date(channel.lastHeartbeat).toLocaleString() : '无记录'}</Typography.Text>}
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      </>}
    </div>
  );
};

export default StatusPage;
