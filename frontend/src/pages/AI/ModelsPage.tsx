import React from 'react';
import { Card, Button, Space } from 'antd';
import { PlusOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const ModelsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <ThunderboltOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          模型配置
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          配置 AI 大模型参数与智能回复策略
        </p>
      </div>

      <Card
        title="模型配置"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建模型</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<ThunderboltOutlined />}
          title="大模型配置 · 规划中"
          description="统一管理模型选型、温度与安全策略。当前为企业版规划模块，开通后可按场景灰度不同模型版本。"
        />
      </Card>
    </div>
  );
};

export default ModelsPage;
