import React from 'react';
import { Card, Button, Space } from 'antd';
import { PlusOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const RulesPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <ThunderboltOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          分配规则
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          配置线索自动分配规则与策略
        </p>
      </div>

      <Card
        title="分配规则管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建规则</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<ThunderboltOutlined />}
          title="分配规则 · 规划中"
          description="按轮询、权重与地域自动分配线索。当前为企业版规划模块，开通后支持多策略组合与回收机制。"
        />
      </Card>
    </div>
  );
};

export default RulesPage;
