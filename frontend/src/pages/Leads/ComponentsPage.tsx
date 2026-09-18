import React from 'react';
import { Card, Button, Space } from 'antd';
import { FormOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const ComponentsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <FormOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          留资组件
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理线索收集表单与留资组件
        </p>
      </div>

      <Card
        title="留资组件管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建组件</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<FormOutlined />}
          title="留资组件 · 规划中"
          description="拖拽生成留资表单，支持手机授权与验证。当前为企业版规划模块，开通后支持多端嵌入与数据回传。"
        />
      </Card>
    </div>
  );
};

export default ComponentsPage;
