import React from 'react';
import { Row, Col } from 'antd';
import { BUSINESS_THEME } from '../config/brand';

interface BusinessPageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

/**
 * 星链云客 · 商务风统一页头
 * 实色浅灰底 + 藏青标题，所有后台功能页统一使用
 */
const BusinessPageHeader: React.FC<BusinessPageHeaderProps> = ({
  icon,
  title,
  subtitle,
  extra,
}) => {
  return (
    <div style={{
      marginBottom: '20px',
      background: '#F6F8FB',
      border: `1px solid ${BUSINESS_THEME.border}`,
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <Row justify="space-between" align="middle">
        <Col>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: BUSINESS_THEME.textPrimary }}>
            <span style={{ marginRight: '8px', color: BUSINESS_THEME.primary }}>
              {icon}
            </span>
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: '8px 0 0 0', color: BUSINESS_THEME.textSecondary, fontSize: 13 }}>
              {subtitle}
            </p>
          )}
        </Col>
        {extra && (
          <Col>
            {extra}
          </Col>
        )}
      </Row>
    </div>
  );
};

export default BusinessPageHeader;
