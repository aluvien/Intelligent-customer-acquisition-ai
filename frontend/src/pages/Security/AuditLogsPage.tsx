import React from 'react';
import { Card, Button, Space } from 'antd';
import { PlusOutlined, SafetyOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const AuditLogsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <SafetyOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          审核记录
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          查看内容审核记录与审核历史
        </p>
      </div>

      <Card
        title="审核记录"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>导出记录</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<SafetyOutlined />}
          title="审核记录 · 规划中"
          description="全链路留痕命中内容、置信度与处置动作。当前为企业版规划模块，开通后支持审计导出与合规 report。"
        />
      </Card>
    </div>
  );
};

export default AuditLogsPage;
