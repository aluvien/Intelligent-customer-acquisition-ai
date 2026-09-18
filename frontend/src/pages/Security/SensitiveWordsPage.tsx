import React from 'react';
import { Card, Button, Space } from 'antd';
import { PlusOutlined, SafetyOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const SensitiveWordsPage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <SafetyOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          敏感词库
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理敏感词库与内容审核规则
        </p>
      </div>

      <Card
        title="敏感词管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>添加敏感词</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<SafetyOutlined />}
          title="敏感词库 · 规划中"
          description="三级分类管理敏感词，支撑发送前拦截。当前为企业版规划模块，开通后支持批量导入与命中测试。"
        />
      </Card>
    </div>
  );
};

export default SensitiveWordsPage;
