import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Modal, Popconfirm, QRCode, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, GlobalOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';
import { useAuth } from '../../contexts/AuthContext';

type DouyinAccount = {
  id: string;
  accountName: string;
  accountId: string;
  status: string;
  accountAuthorization: 'verified' | 'unverified';
  messageCapability: 'verified' | 'unverified';
  lastHeartbeat: string | null;
};

type OAuthConfig = {
  configured: boolean;
  redirectUri?: string;
  scopes: string[];
  error?: string;
  messageCapability: 'unverified';
};

type OAuthStatus = 'idle' | 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';

const DouyinPage: React.FC = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<DouyinAccount[]>([]);
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [creatingOauth, setCreatingOauth] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>('idle');
  const [oauthError, setOauthError] = useState('');
  const completedRequest = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<any>[] = [api.get('/channels')];
      if (user?.role === 'admin') requests.push(api.get('/channels/douyin/oauth/config'));
      const [channelResponse, configResponse] = await Promise.all(requests);
      setAccounts((channelResponse.data.data.channels || []).filter((item: any) => item.type === 'douyin'));
      if (configResponse) setConfig(configResponse.data.data);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '渠道加载失败');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => { void load(); }, [load]);

  const startOAuth = async () => {
    setOauthOpen(true);
    setOauthError('');
    setOauthStatus('idle');
    setRequestId('');
    setAuthUrl('');
    setExpiresAt('');
    setCreatingOauth(true);
    try {
      const response = await api.post('/channels/douyin/oauth/requests');
      setRequestId(response.data.data.requestId);
      setAuthUrl(response.data.data.authUrl);
      setExpiresAt(response.data.data.expiresAt);
      setOauthStatus('pending');
      completedRequest.current = '';
      setConfig((current) => current ? { ...current, configured: true, error: undefined } : current);
    } catch (err: any) {
      setOauthError(err?.response?.data?.message || '创建扫码授权请求失败');
      setOauthStatus('failed');
    } finally {
      setCreatingOauth(false);
    }
  };

  useEffect(() => {
    if (!oauthOpen || !requestId || !['pending', 'processing'].includes(oauthStatus)) return;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const response = await api.get(`/channels/douyin/oauth/requests/${encodeURIComponent(requestId)}`);
        if (disposed) return;
        const next = response.data.data.status as OAuthStatus;
        setOauthStatus(next);
        if (next === 'succeeded' && completedRequest.current !== requestId) {
          completedRequest.current = requestId;
          message.success('抖音账号添加成功');
          await load();
        } else if (next === 'failed' || next === 'expired') {
          setOauthError(response.data.data.errorMessage || '授权未完成，请重新生成二维码');
        }
      } catch (err: any) {
        if (!disposed) setOauthError(err?.response?.data?.message || '查询授权状态失败');
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [load, oauthOpen, oauthStatus, requestId]);

  const closeOauth = () => {
    setOauthOpen(false);
    setRequestId('');
    setAuthUrl('');
    setExpiresAt('');
    setOauthStatus('idle');
    setOauthError('');
  };

  const disableAccount = async (accountId: string) => {
    try {
      await api.delete(`/channels/${encodeURIComponent(accountId)}`);
      message.success('抖音账号已停用，服务端凭据已清除');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '停用账号失败');
    }
  };

  const configurationMessage = config?.configured
    ? '账号扫码授权已可用。评论、私信、直播监听和回复仍需相应开放平台权限及真实收发验收。'
    : config?.error || '正在检查抖音开放平台配置。';

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader
      icon={<GlobalOutlined />}
      title="抖音渠道"
      subtitle="通过抖音开放平台扫码授权添加账号，凭据只加密保存在服务端"
      extra={<Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        {user?.role === 'admin' && <Button type="primary" icon={<PlusOutlined />} onClick={() => void startOAuth()}>添加抖音账号</Button>}
      </Space>}
    />
    <Alert
      type={config?.configured ? 'info' : 'warning'}
      showIcon
      message={config?.configured ? '账号扫码授权可用' : '需要配置抖音开放平台应用'}
      description={configurationMessage}
      style={{ marginBottom: 16 }}
    />
    <Card title="抖音账号">
      <Table<DouyinAccount>
        rowKey="id"
        loading={loading}
        dataSource={accounts}
        locale={{ emptyText: <Empty description="暂无抖音授权账号，请点击右上角添加" /> }}
        columns={[
          { title: '账号', dataIndex: 'accountName' },
          { title: 'Open ID', dataIndex: 'accountId' },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'authorized' ? 'success' : 'default'}>{value}</Tag> },
          { title: '账号授权', dataIndex: 'accountAuthorization', render: (value: string) => <Tag color={value === 'verified' ? 'success' : 'orange'}>{value}</Tag> },
          { title: '消息收发', dataIndex: 'messageCapability', render: (value: string) => <Tag color={value === 'verified' ? 'success' : 'orange'}>{value}</Tag> },
          { title: '最近真实事件', dataIndex: 'lastHeartbeat', render: (value: string | null) => value ? new Date(value).toLocaleString() : '暂无' },
          ...(user?.role === 'admin' ? [{
            title: '操作',
            key: 'actions',
            render: (_: unknown, account: DouyinAccount) => <Popconfirm title="停用这个账号并清除服务端凭据？" onConfirm={() => void disableAccount(account.id)} okText="停用" cancelText="取消"><Button danger type="link" icon={<DeleteOutlined />}>停用</Button></Popconfirm>,
          }] : []),
        ]}
      />
    </Card>

    <Modal title="添加抖音账号" open={oauthOpen} onCancel={closeOauth} footer={<Button onClick={closeOauth}>{oauthStatus === 'succeeded' ? '完成' : '关闭'}</Button>} destroyOnHidden>
      {oauthError && <Alert type="error" showIcon message="暂时无法扫码授权" description={oauthError} style={{ marginBottom: 16 }} />}
      {!authUrl && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>需要在服务端配置抖音开放平台网站应用，并将 HTTPS 回调地址登记到开放平台。Client Secret 不会保存到浏览器。</Typography.Paragraph>
        {config?.redirectUri && <Typography.Text copyable>回调地址：{config.redirectUri}</Typography.Text>}
        <Button type="primary" loading={creatingOauth} onClick={() => void startOAuth()}>检查配置并生成二维码</Button>
      </Space>}
      {authUrl && <Space direction="vertical" align="center" size="middle" style={{ width: '100%' }}>
        {oauthStatus === 'succeeded'
          ? <Alert type="success" showIcon message="账号添加成功" description="账号信息和加密凭据已保存，可以关闭窗口。" />
          : ['failed', 'expired'].includes(oauthStatus)
            ? <Space direction="vertical" align="center">
              <Typography.Text type="secondary">这个一次性二维码已失效，请生成新的授权请求。</Typography.Text>
              <Button type="primary" loading={creatingOauth} onClick={() => void startOAuth()}>重新生成二维码</Button>
            </Space>
          : <>
            <QRCode value={authUrl} size={224} status="active" />
            <Typography.Text>请使用抖音 App 扫码并确认授权</Typography.Text>
            <Typography.Text type="secondary">二维码有效期至 {expiresAt ? new Date(expiresAt).toLocaleTimeString() : '-'}</Typography.Text>
            <Button onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}>打开抖音官方授权页</Button>
          </>}
      </Space>}
    </Modal>
  </div>;
};

export default DouyinPage;
