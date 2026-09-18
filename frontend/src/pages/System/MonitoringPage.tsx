import React from 'react';
import { Card, Button, Space } from 'antd';
import { MonitorOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const MonitoringPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <MonitorOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          监控告警
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          系统监控与告警管理
        </p>
      </div>

      <Card
        title="监控告警"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建告警</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<MonitorOutlined />}
          title="监控告警 · 规划中"
          description="CPU、内存、延迟与业务指标实时告警。当前为企业版规划模块，开通后支持多渠道通知与值班排班。"
        />
      </Card>
    </div>
  );
};

export default MonitoringPage;
