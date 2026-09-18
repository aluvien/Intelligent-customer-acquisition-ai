import React from 'react';
import { Card, Button, Space } from 'antd';
import { MessageOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const AutoReplyPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <MessageOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          自动回复配置
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          配置 AI 自动回复规则与智能回复策略
        </p>
      </div>

      <Card
        title="自动回复规则"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建规则</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<MessageOutlined />}
          title="自动回复规则 · 规划中"
          description="按关键词、意图与沉默超时编排自动回复。当前为企业版规划模块，开通后支持可视化规则引擎。"
        />
      </Card>
    </div>
  );
};

export default AutoReplyPage;
