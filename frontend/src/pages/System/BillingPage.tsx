import React from 'react';
import { Card, Button, Space } from 'antd';
import { DollarOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const BillingPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <DollarOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          计费账单
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理系统计费与账单信息
        </p>
      </div>

      <Card
        title="账单管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建账单</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<DollarOutlined />}
          title="计费账单 · 规划中"
          description="套餐订阅、用量统计与开票统一管理。当前为企业版规划模块，开通后支持 Stripe / 支付宝对接。"
        />
      </Card>
    </div>
  );
};

export default BillingPage;
