import React from 'react';
import { Card, Button, Space } from 'antd';
import { PlusOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const TenantsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <UserOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          租户管理
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理系统租户与权限配置
        </p>
      </div>

      <Card
        title="租户列表"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建租户</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<UserOutlined />}
          title="租户管理 · 规划中"
          description="多租户隔离、套餐与配额统一管控。当前为企业版规划模块，开通后支持租户 onboarding 全流程。"
        />
      </Card>
    </div>
  );
};

export default TenantsPage;
