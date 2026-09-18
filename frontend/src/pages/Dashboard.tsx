import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Col, Empty, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { BarChartOutlined, ClockCircleOutlined, MessageOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import api from '../services/api';
import BusinessPageHeader from '../components/BusinessPageHeader';
import { BUSINESS_THEME } from '../config/brand';

type Stats = { totalConversations: number; activeConversations: number; totalLeads: number; newLeads: number; conversionRate: number; avgResponseTime: number | null; satisfactionScore: number | null };

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [realtime, setRealtime] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, channelData, realtimeData] = await Promise.all([api.get('/analytics/dashboard'), api.get('/analytics/channels'), api.get('/analytics/realtime')]);
      setStats(dashboard.data.data);
      setChannels(channelData.data.data.channels || []);
      setRealtime(realtimeData.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || '统计数据加载失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<BarChartOutlined />} title="业务总览" subtitle="所有指标均来自当前企业的持久化业务记录" extra={<Typography.Link onClick={() => void load()}>刷新</Typography.Link>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    {loading && !stats ? <Spin /> : <>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card><Statistic title="累计会话" value={stats?.totalConversations || 0} prefix={<MessageOutlined />} valueStyle={{ color: BUSINESS_THEME.primary }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card><Statistic title="进行中" value={stats?.activeConversations || 0} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card><Statistic title="已留资线索" value={stats?.totalLeads || 0} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card><Statistic title="留资转化率" value={stats?.conversionRate || 0} suffix="%" prefix={<UserOutlined />} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}><Card title="实时状态"><Space size="large" wrap><Statistic title="在线客服连接" value={realtime?.onlineUsers ?? 0} /><Statistic title="近一分钟消息" value={realtime?.messagesPerMinute ?? 0} /><Statistic title="系统内存比例" value={realtime?.systemLoad ?? 0} suffix="%" /></Space><Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>没有持久化数据的指标不会用随机数填充；满意度等尚未采集的指标会显示为未知。</Typography.Paragraph></Card></Col>
        <Col xs={24} lg={12}><Card title="真实数据口径"><Typography.Paragraph>新线索：{stats?.newLeads ?? 0} 条</Typography.Paragraph><Typography.Paragraph>平均首次响应：{stats?.avgResponseTime == null ? <Tag>未知</Tag> : `${stats.avgResponseTime} 秒`}</Typography.Paragraph><Typography.Paragraph style={{ marginBottom: 0 }}>满意度：{stats?.satisfactionScore == null ? <Tag>尚未采集</Tag> : stats.satisfactionScore}</Typography.Paragraph></Card></Col>
      </Row>
      <Card title="渠道统计" style={{ marginTop: 16 }}><Table rowKey="channelId" dataSource={channels} locale={{ emptyText: <Empty description="暂无真实渠道数据" /> }} pagination={false} columns={[{ title: '渠道', dataIndex: 'channelName' }, { title: '会话', dataIndex: 'conversations' }, { title: '线索', dataIndex: 'leads' }, { title: '转化率', dataIndex: 'conversionRate', render: (value: number) => `${value || 0}%` }]} /></Card>
    </>}
  </div>;
};

export default Dashboard;
