import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Button, Space, Typography, Tag } from 'antd';
import {
  DashboardOutlined,
  MessageOutlined,
  UserOutlined,
  SettingOutlined,
  BarChartOutlined,
  RobotOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  SafetyOutlined,
  ForkOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../contexts/AuthContext';
import { BRAND, BUSINESS_THEME } from '../config/brand';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '工作台总览',
    },
    {
      key: 'channels',
      icon: <GlobalOutlined />,
      label: '渠道中心',
      children: [
        { key: '/channels/douyin', label: '抖音渠道' },
        { key: '/channels/kuaishou', label: '快手渠道' },
        { key: '/channels/wechat', label: '视频号渠道' },
        { key: '/channels/xiaohongshu', label: '小红书渠道' },
        { key: '/channels/status', label: '渠道状态监控' },
      ],
    },
    {
      key: 'conversations',
      icon: <MessageOutlined />,
      label: '对话管理',
      children: [
        { key: '/conversations/active', label: '进行中对话' },
        { key: '/conversations/auto-reply', label: '自动回复配置' },
        { key: '/conversations/handover', label: '人工接管' },
      ],
    },
    {
      key: 'ai',
      icon: <RobotOutlined />,
      label: '智能机器人',
      children: [
        { key: '/ai/intents', label: '意图管理' },
        { key: '/ai/knowledge', label: '知识库管理' },
        { key: '/ai/models', label: '模型配置' },
      ],
    },
    {
      key: 'leads',
      icon: <TeamOutlined />,
      label: '线索中心',
      children: [
        { key: '/leads/list', label: '线索管理' },
        { key: '/leads/assignment', label: '分配规则' },
        { key: '/leads/components', label: '留资组件' },
      ],
    },
    {
      key: 'workflow',
      icon: <ForkOutlined />,
      label: '流程编排',
      children: [
        { key: '/workflow/designer', label: '流程设计' },
        { key: '/workflow/versions', label: '版本管理' },
      ],
    },
    {
      key: 'analytics',
      icon: <BarChartOutlined />,
      label: '数据分析',
      children: [
        { key: '/analytics/dashboard', label: '经营仪表盘' },
        { key: '/analytics/channels', label: '渠道对比分析' },
        { key: '/analytics/performance', label: '客服绩效' },
      ],
    },
    {
      key: 'security',
      icon: <SafetyOutlined />,
      label: '内容安全',
      children: [
        { key: '/security/sensitive-words', label: '敏感词库' },
        { key: '/security/audit', label: '审核记录' },
      ],
    },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [
        { key: '/system/tenants', label: '租户管理' },
        { key: '/system/billing', label: '计费账单' },
        { key: '/system/monitoring', label: '监控告警' },
      ],
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === '/dashboard') {
      setOpenKeys([]);
    }
    navigate(key);
  };

  const handleOpenChange = (keys: string[]) => {
    const latestOpenKey = keys[keys.length - 1];
    setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
  };

  const handleLogout = () => {
    void logout().finally(() => navigate('/login', { replace: true }));
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{ background: BUSINESS_THEME.siderBg, borderRight: `1px solid ${BUSINESS_THEME.border}` }}
      >
        <div style={{
          height: 64,
          margin: 0,
          padding: collapsed ? '14px 0' : '12px 18px',
          background: BUSINESS_THEME.siderBg,
          borderBottom: `1px solid ${BUSINESS_THEME.border}`,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${BUSINESS_THEME.primary} 0%, ${BUSINESS_THEME.primaryHover} 100%)`,
            color: '#fff', fontWeight: 700, fontSize: 15,
            boxShadow: '0 2px 8px rgba(14,124,107,0.35)',
          }}>
            {BRAND.shortCode}
          </span>
          {!collapsed && (
            <span>
              <span style={{
                display: 'block',
                color: BUSINESS_THEME.textPrimary,
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: 1,
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
              }}>
                {BRAND.name}
              </span>
              <span style={{
                display: 'block',
                color: BUSINESS_THEME.textSecondary,
                fontSize: 9,
                letterSpacing: 2.5,
              }}>
                {BRAND.englishName}
              </span>
            </span>
          )}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ background: 'transparent', borderRight: 0, padding: '12px 10px' }}
        />
        {!collapsed && (
          <div style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            padding: '10px 12px',
            background: BUSINESS_THEME.siderLogoBg,
            borderRadius: 10,
            border: `1px solid ${BUSINESS_THEME.border}`,
          }}>
            <Text style={{ color: BUSINESS_THEME.siderText, fontSize: 12 }}>{BRAND.version}</Text>
          </div>
        )}
      </Sider>
      <AntLayout style={{ background: BUSINESS_THEME.contentBg }}>
        <div style={{
          height: 3, flexShrink: 0,
          background: `linear-gradient(90deg, ${BUSINESS_THEME.primary} 0%, ${BUSINESS_THEME.primaryHover} 45%, #7FD1C0 100%)`,
        }} />
        <Header style={{
          padding: '0 24px',
          background: BUSINESS_THEME.headerBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${BUSINESS_THEME.border}`,
          height: 64,
        }}>
          <Space size={16} style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 40, height: 40, flexShrink: 0 }}
            />
            <div style={{
              borderLeft: `1px solid ${BUSINESS_THEME.border}`,
              paddingLeft: 16,
              overflow: 'hidden',
              minWidth: 0,
              lineHeight: 1.5,
            }}>
              <div style={{
                fontSize: 15, fontWeight: 600, color: BUSINESS_THEME.textPrimary,
                lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {BRAND.subtitle}
              </div>
              <div style={{
                fontSize: 12, color: BUSINESS_THEME.textSecondary,
                lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {BRAND.description}
              </div>
            </div>
          </Space>
          <Space size={16}>
            <Tag color="processing" style={{ borderRadius: 4, fontSize: 12 }}>企业版</Tag>
            <NotificationCenter />
            <Space size={8}>
              <Avatar
                style={{ backgroundColor: BUSINESS_THEME.primary, cursor: 'pointer' }}
                icon={<UserOutlined />}
              />
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: BUSINESS_THEME.textPrimary }}>
                  {user?.username || '管理员'}
                </div>
                <div style={{ fontSize: 11, color: BUSINESS_THEME.textSecondary }}>企业管理员</div>
              </div>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Button type="text" size="small">账户</Button>
              </Dropdown>
            </Space>
          </Space>
        </Header>
        <Content style={{
          margin: '20px 24px',
          padding: 24,
          background: BUSINESS_THEME.cardBg,
          minHeight: 280,
          borderRadius: 14,
          border: `1px solid ${BUSINESS_THEME.border}`,
        }}>
          {children}
        </Content>
        <div style={{
          textAlign: 'center',
          padding: '0 0 20px 0',
          color: BUSINESS_THEME.textSecondary,
          fontSize: 12,
        }}>
          {BRAND.copyright}
        </div>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
