import React from 'react';
import { Alert, Card, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import BusinessPageHeader from './BusinessPageHeader';

interface Props { title: string; subtitle?: string; description: string; }

const FeatureUnavailable: React.FC<Props> = ({ title, subtitle, description }) => <div style={{ padding: '4px 0' }}>
  <BusinessPageHeader icon={<InfoCircleOutlined />} title={title} subtitle={subtitle || '该功能尚未完成真实业务实现'} />
  <Card><Alert type="info" showIcon message="当前未启用" description={description} /><Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>系统不会用演示数据代替真实业务结果。完成对应的数据库、权限和联调验收后再启用此功能。</Typography.Paragraph></Card>
</div>;

export default FeatureUnavailable;
