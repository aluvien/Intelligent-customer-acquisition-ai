import React from 'react';
import { Card, Button, Space } from 'antd';
import { ForkOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const VersionsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <ForkOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          版本管理
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理流程版本与灰度发布
        </p>
      </div>

      <Card
        title="版本管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建版本</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<ForkOutlined />}
          title="版本管理 · 规划中"
          description="蓝绿发布与灰度放量，变更可追溯可回滚。当前为企业版规划模块，开通后支持审批流。"
        />
      </Card>
    </div>
  );
};

export default VersionsPage;
