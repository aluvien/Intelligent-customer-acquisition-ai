import React, { useState } from 'react';
import { Button, Space } from 'antd';
import { BellOutlined, CloseOutlined } from '@ant-design/icons';

const NotificationCenter: React.FC = () => {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <Button
        type="text"
        icon={<BellOutlined />}
        onClick={() => setVisible((current) => !current)}
        aria-label="打开通知中心"
      />
      {visible && (
        <div style={{
          position: 'absolute',
          top: '40px',
          right: 0,
          width: 320,
          padding: 16,
          backgroundColor: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>通知中心</span>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setVisible(false)} aria-label="关闭通知中心" />
          </Space>
          <div style={{ padding: '20px 0 4px', color: '#666', textAlign: 'center' }}>
            暂无已接入的系统通知事件
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
