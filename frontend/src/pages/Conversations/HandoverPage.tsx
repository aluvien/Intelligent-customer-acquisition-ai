import React from 'react';
import { Card, Button, Space } from 'antd';
import { SettingOutlined, SwapOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const HandoverPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <SwapOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          人工接管
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          配置 AI 与人工客服的切换规则
        </p>
      </div>

      <Card
        title="切换规则配置"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<SwapOutlined />}>新建规则</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<SwapOutlined />}
          title="人工接管 · 规划中"
          description="AI 与人工无缝协作，支持强制接管与会话保持。当前为企业版规划模块，开通后支持快捷键与接管审计。"
        />
      </Card>
    </div>
  );
};

export default HandoverPage;
