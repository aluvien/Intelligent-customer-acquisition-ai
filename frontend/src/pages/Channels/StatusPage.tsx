import React from 'react';
import { Card, Row, Col, Statistic, Progress, Alert, List, Badge, Space } from 'antd';
import { GlobalOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import BusinessPageHeader from '../../components/BusinessPageHeader';
import { BUSINESS_THEME } from '../../config/brand';

const StatusPage: React.FC = () => {
  const channelStatus = [
    { name: '抖音渠道', status: 'connected', uptime: '99.9%', lastCheck: '2分钟前' },
    { name: '快手渠道', status: 'disconnected', uptime: '0%', lastCheck: '5分钟前' },
    { name: '视频号渠道', status: 'warning', uptime: '95.2%', lastCheck: '1分钟前' },
    { name: '小红书渠道', status: 'disconnected', uptime: '0%', lastCheck: '10分钟前' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'success';
      case 'disconnected': return 'error';
      case 'warning': return 'warning';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return '正常';
      case 'disconnected': return '断开';
      case 'warning': return '异常';
      default: return '未知';
    }
  };

  return (
    <div style={{ padding: '4px 0' }}>
      <BusinessPageHeader
        icon={<GlobalOutlined />}
        title="渠道状态监控"
        subtitle="星链云客系统 · 监控所有渠道的连接状态和运行情况"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={8} lg={6}>
          <Card style={{ borderColor: BUSINESS_THEME.border }}>
            <Statistic
              title="正常渠道"
              value={channelStatus.filter(c => c.status === 'connected').length}
              prefix={<CheckCircleOutlined style={{ color: '#12A086' }} />}
              valueStyle={{ color: '#12A086' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <Card style={{ borderColor: BUSINESS_THEME.border }}>
            <Statistic
              title="异常渠道"
              value={channelStatus.filter(c => c.status === 'warning').length}
              prefix={<WarningOutlined style={{ color: '#D97706' }} />}
              valueStyle={{ color: '#D97706' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <Card style={{ borderColor: BUSINESS_THEME.border }}>
            <Statistic
              title="断开渠道"
              value={channelStatus.filter(c => c.status === 'disconnected').length}
              prefix={<CloseCircleOutlined style={{ color: '#E5484D' }} />}
              valueStyle={{ color: '#E5484D' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <Card style={{ borderColor: BUSINESS_THEME.border }}>
            <Statistic
              title="总渠道数"
              value={channelStatus.length}
              prefix={<GlobalOutlined style={{ color: BUSINESS_THEME.primary }} />}
              valueStyle={{ color: BUSINESS_THEME.primary }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderColor: BUSINESS_THEME.border }} title="渠道状态详情">
        <List
          dataSource={channelStatus}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.name}</span>
                    <Badge 
                      status={getStatusColor(item.status)} 
                      text={getStatusText(item.status)}
                    />
                  </Space>
                }
                description={
                  <div>
                    <div>运行时间: {item.uptime}</div>
                    <div>最后检查: {item.lastCheck}</div>
                    <Progress 
                      percent={parseFloat(item.uptime)} 
                      size="small" 
                      showInfo={false}
                      strokeColor={item.status === 'connected' ? '#12A086' : item.status === 'warning' ? '#D97706' : '#E5484D'}
                    />
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default StatusPage;
