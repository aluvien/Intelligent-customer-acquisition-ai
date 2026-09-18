import React from 'react';
import { Card, Button, Space } from 'antd';
import { BookOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import BusinessEmptyState from '../../components/BusinessEmptyState';
import { BUSINESS_THEME } from '../../config/brand';

const KnowledgePage: React.FC = () => {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
          <BookOutlined style={{ marginRight: '8px', color: BUSINESS_THEME.primary }} />
          知识库管理
        </h1>
        <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
          管理 AI 知识库与常见问题解答
        </p>
      </div>

      <Card
        title="知识库管理"
        extra={
          <Space>
            <Button icon={<SettingOutlined />}>全局设置</Button>
            <Button type="primary" icon={<PlusOutlined />}>新建知识</Button>
          </Space>
        }
      >
        <BusinessEmptyState
          icon={<BookOutlined />}
          title="企业知识库 · 规划中"
          description="结构化沉淀企业话术与 FAQ，支撑 AI 准确回复。当前为企业版规划模块，开通后可按租户管理知识版本与生效范围。"
        />
      </Card>
    </div>
  );
};

export default KnowledgePage;
