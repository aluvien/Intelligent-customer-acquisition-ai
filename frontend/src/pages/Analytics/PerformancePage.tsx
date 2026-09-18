import React from 'react';
import { Card, Button, Space } from 'antd';
import { BarChartOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const PerformancePage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <BarChartOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          客服绩效
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          分析客服团队的工作绩效与效率
        </p>
      </div>

      <Card
        title="客服绩效分析"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建报告</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<BarChartOutlined />}
          title="客服绩效 · 规划中"
          description="统计响应时长、解决率与转化贡献。当前为企业版规划模块，开通后支持按人员、班组多维考核。"
        />
      </Card>
    </div>
  );
};

export default PerformancePage;
