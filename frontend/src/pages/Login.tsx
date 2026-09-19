import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Tabs, Checkbox, Tag, Alert } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, TeamOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { BRAND, BUSINESS_THEME } from '../config/brand';

const Login: React.FC = () => {
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/';

  // 页面加载时检查是否有记住的用户名（只记用户名，不记密码）
  React.useEffect(() => {
    const rememberedUsername = localStorage.getItem('rememberedUsername');

    if (rememberedUsername) {
      loginForm.setFieldsValue({
        username: rememberedUsername,
        remember: true
      });
    }
  }, [loginForm]);

  const handleLogin = async (values: any) => {
    setLoginError(null);
    setLoading(true);
    try {
      // 记住我只保存用户名，明文密码永不持久化
      if (values.remember) {
        localStorage.setItem('rememberedUsername', values.username);
      } else {
        // 如果没有选择记住我，清除保存的信息
        localStorage.removeItem('rememberedUsername');
      }
      localStorage.removeItem('rememberedPassword');

      await login(values.username, values.password);
      message.success('登录成功，欢迎回来');
      navigate(from, { replace: true });
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || '登录失败，请检查用户名和密码';
      setLoginError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: any) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await register(values.username, values.email, values.password, values.confirmPassword, values.tenantName);
      message.success('注册成功，已为您开通企业试用空间');
      navigate(from, { replace: true });
    } catch (error) {
      message.error('注册失败，请检查输入信息');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px 32px',
      position: 'relative',
      overflow: 'hidden',
      background: '#EDF4F2',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute', top: -180, left: '50%', transform: 'translateX(-50%)',
        width: 720, height: 720, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(14,124,107,0.14) 0%, rgba(14,124,107,0) 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -220, left: -160, width: 520, height: 520, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(18,160,134,0.12) 0%, rgba(18,160,134,0) 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, right: -140, width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(14,124,107,0.10) 0%, rgba(14,124,107,0) 65%)',
        pointerEvents: 'none',
      }} />

      {/* 顶部品牌 */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${BUSINESS_THEME.primary} 0%, ${BUSINESS_THEME.primaryHover} 100%)`,
            color: '#fff', fontWeight: 700, fontSize: 20,
            boxShadow: '0 6px 20px rgba(14,124,107,0.4)',
          }}>
            {BRAND.shortCode}
          </span>
          <span style={{ textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 24, fontWeight: 700, color: BUSINESS_THEME.textPrimary, letterSpacing: 2 }}>
              {BRAND.name}
            </span>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: 4, color: BUSINESS_THEME.textSecondary }}>
              {BRAND.englishName}
            </span>
          </span>
          <Tag style={{ borderRadius: 20, marginLeft: 4 }} color="success">企业版</Tag>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: BUSINESS_THEME.textSecondary }}>
          {BRAND.subtitle} · {BRAND.description}
        </div>
      </div>

      {/* 居中卡片 */}
      <Card style={{ position: 'relative', zIndex: 1, width: 440, maxWidth: '100%', borderRadius: 16, boxShadow: '0 12px 40px rgba(26,43,40,0.10)' }}>
        <Tabs
          defaultActiveKey="login"
          centered
          items={[
            {
              key: 'login',
              label: '账号登录',
              children: (
                <Form
                  form={loginForm}
                  name="login"
                  onFinish={handleLogin}
                  onValuesChange={() => setLoginError(null)}
                  autoComplete="off"
                  size="large"
                >
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名!' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码!' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码"
                    />
                  </Form.Item>

                  {loginError && (
                    <Alert
                      type="error"
                      showIcon
                      message={loginError}
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Form.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Form.Item name="remember" valuePropName="checked" noStyle>
                        <Checkbox>记住用户名</Checkbox>
                      </Form.Item>
                      <Button type="link" style={{ padding: 0 }}>
                        忘记密码？
                      </Button>
                    </div>
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600 }}
                    >
                      登录工作台
                    </Button>
                  </Form.Item>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: BUSINESS_THEME.textSecondary, fontSize: 12,
                    background: BUSINESS_THEME.siderLogoBg, border: `1px solid ${BUSINESS_THEME.border}`,
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <SafetyOutlined />
                    <span>企业数据加密传输，多租户安全隔离</span>
                  </div>
                </Form>
              )
            },
            {
              key: 'register',
              label: '企业注册',
              children: (
                <Form
                  form={registerForm}
                  name="register"
                  onFinish={handleRegister}
                  autoComplete="off"
                  size="large"
                >
                  <Form.Item
                    name="username"
                    rules={[
                      { required: true, message: '请输入用户名!' },
                      { min: 3, message: '用户名至少3个字符!' }
                    ]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="用户名"
                    />
                  </Form.Item>

                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入企业邮箱!' },
                      { type: 'email', message: '请输入有效的邮箱地址!' }
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      placeholder="企业邮箱"
                    />
                  </Form.Item>

                  <Form.Item
                    name="tenantName"
                    rules={[{ required: true, message: '请输入企业名称!' }]}
                  >
                    <Input
                      prefix={<TeamOutlined />}
                      placeholder="企业名称"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码!' },
                      { min: 6, message: '密码至少6个字符!' }
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="设置密码"
                    />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    rules={[
                      { required: true, message: '请确认密码!' }
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="确认密码"
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600 }}
                    >
                      注册并开通试用
                    </Button>
                  </Form.Item>
                </Form>
              )
            }
          ]}
        />
      </Card>

      {/* 底部卖点 + 版权 */}
      <div style={{
        position: 'relative', zIndex: 1, marginTop: 24,
        display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {['全渠道统一接入', 'AI 自动转化', '多租户安全隔离'].map(t => (
          <span key={t} style={{
            fontSize: 12, color: BUSINESS_THEME.siderText,
            background: 'rgba(255,255,255,0.75)', border: `1px solid ${BUSINESS_THEME.border}`,
            borderRadius: 20, padding: '4px 14px',
          }}>
            {t}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 1, marginTop: 14, fontSize: 12, color: BUSINESS_THEME.textSecondary }}>
        {BRAND.copyright}
      </div>
    </div>
  );
};

export default Login;
