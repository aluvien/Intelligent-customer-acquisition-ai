import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { message } from 'antd';
import { ApiResponse } from '../types';

// 前后端路径统一以 /api 为前缀（后端挂载在 app.use('/api', ...)）
// 开发环境经 CRA proxy 转发到 http://localhost:3001，/api/* 同样会被转发
const API_PREFIX = process.env.REACT_APP_API_URL || '/api';

const api: AxiosInstance = axios.create({
  baseURL: API_PREFIX,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string> | null = null;

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
    const tenantId = localStorage.getItem('tenantId');
    if (tenantId) {
      (config.headers as any)['X-Tenant-ID'] = tenantId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response as any;
    if (data && Object.prototype.hasOwnProperty.call(data, 'success') && data.success === false) {
      const msg = data.message || '请求失败';
      message.error(msg);
      return Promise.reject(new Error(msg));
    }
    return response;
  },
  async (error) => {
    if (error.response) {
      const { status, data } = error.response as any;
      // 登录/注册接口的 401 是业务失败（密码错），交给调用方处理，不全局跳转
      const reqUrl: string = (error.config as any)?.url || '';
      const isAuthPage = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register') || reqUrl.includes('/auth/refresh') || reqUrl.includes('/public/');
      switch (status) {
        case 401:
          if (isAuthPage) {
            break;
          }
          if (!(error.config as any)?._retry) {
            (error.config as any)._retry = true;
            refreshPromise ||= api.post('/auth/refresh').then((response) => {
              const nextToken = response.data.data.token as string;
              localStorage.setItem('token', nextToken);
              return nextToken;
            }).finally(() => { refreshPromise = null; });
            try {
              const nextToken = await refreshPromise;
              (error.config.headers as any).Authorization = `Bearer ${nextToken}`;
              return api.request(error.config);
            } catch {
              // Refresh failed; fall through to the normal logout path below.
            }
          }
          message.error('登录已过期，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          break;
        case 403:
          message.error('权限不足');
          break;
        case 404:
          message.error('请求的资源不存在');
          break;
        case 500:
          message.error('服务器内部错误');
          break;
        default:
          message.error((data && data.message) || '请求失败');
      }
    } else if (error.request) {
      message.error('网络连接失败，请检查网络');
    } else {
      message.error('请求配置错误');
    }
    return Promise.reject(error);
  }
);

export default api;
