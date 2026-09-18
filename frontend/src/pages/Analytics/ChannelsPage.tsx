import React from 'react';
import { Card, Button, Space } from 'antd';
import { BarChartOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const ChannelsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <BarChartOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          渠道对比分析
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          对比分析各渠道的运营数据
        </p>
      </div>

      <Card
        title="渠道对比分析"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建报告</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<BarChartOutlined />}
          title="渠道对比分析 · 规划中"
          description="横向对比各渠道获客、留资与转化效果。当前为企业版规划模块，开通后支持自定义报表口径与下钻。"
        />
      </Card>
    </div>
  );
};

export default ChannelsPage;
