import React from 'react';
import { Button, Space, Tag } from 'antd';
import { BUSINESS_THEME } from '../config/brand';

interface BusinessEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusText?: string;
  onPrimaryAction?: () => void;
  primaryActionText?: string;
}

/**
 * 星链云客 · 商务风统一空状态
 * 用于尚未上线的企业功能模块，保持与整体藏青商务风格一致
 */
const BusinessEmptyState: React.FC<BusinessEmptyStateProps> = ({
  icon,
  title,
  description,
  statusText = '企业版规划中',
  onPrimaryAction,
  primaryActionText = '联系商务开通',
}) => {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 72,
        height: 72,
        borderRadius: 16,
        background: '#EEF2F7',
        border: `1px solid ${BUSINESS_THEME.border}`,
        fontSize: 32,
        color: BUSINESS_THEME.primary,
        marginBottom: 16,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: BUSINESS_THEME.textPrimary, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: BUSINESS_THEME.textSecondary, marginBottom: 12, lineHeight: 1.7 }}>
        {description}
      </div>
      <div style={{ marginBottom: 20 }}>
        <Tag style={{ borderRadius: 4 }} color="processing">{statusText}</Tag>
        <Tag style={{ borderRadius: 4 }}>星链云客 · 企业版</Tag>
      </div>
      <Space>
        {onPrimaryAction ? (
          <Button type="primary" onClick={onPrimaryAction}>
            {primaryActionText}
          </Button>
        ) : (
          <Button type="primary" disabled>
            {primaryActionText}
          </Button>
        )}
        <Button disabled>产品手册未接入</Button>
      </Space>
    </div>
  );
};

export default BusinessEmptyState;
