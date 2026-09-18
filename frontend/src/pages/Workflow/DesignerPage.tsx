import React from 'react';
import { Card, Button, Space } from 'antd';
import { ForkOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const DesignerPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <ForkOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          流程设计
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          可视化流程设计工具
        </p>
      </div>

      <Card
        title="流程画布"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建流程</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<ForkOutlined />}
          title="流程画布 · 规划中"
          description="拖拽编排获客转化流程，所见即所得。当前为企业版规划模块，开通后支持 BPMN 导入导出。"
        />
      </Card>
    </div>
  );
};

export default DesignerPage;
