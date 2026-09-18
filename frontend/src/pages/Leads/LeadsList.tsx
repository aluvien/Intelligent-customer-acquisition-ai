import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Table, message } from 'antd';
import { ContactsOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

const statusLabels: Record<string, string> = { new: '新线索', contacted: '已联系', qualified: '已确认', converted: '已转化', lost: '已失效' };

const LeadsList: React.FC = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await api.get('/leads', { params: { status: status === 'all' ? undefined : status, limit: 100 } }); setLeads(response.data.data.leads || []); }
    catch (err: any) { setError(err?.response?.data?.message || '线索加载失败'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try { await form.validateFields(); await api.post('/leads', form.getFieldsValue()); message.success('线索已保存'); form.resetFields(); setCreateOpen(false); await load(); }
    catch (err: any) { if (err?.errorFields) return; message.error(err?.response?.data?.message || '线索保存失败'); }
  };

  const updateStatus = async (id: string, nextStatus: string) => {
    try { await api.patch(`/leads/${id}`, { status: nextStatus }); await load(); }
    catch (err: any) { message.error(err?.response?.data?.message || '线索更新失败'); }
  };

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<ContactsOutlined />} title="线索中心" subtitle="线索只来自客户主动提供或授权的联系方式" extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>登记线索</Button></Space>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="真实线索"><Space style={{ marginBottom: 16 }}><Select value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} style={{ width: 130 }} /></Space><Table rowKey="id" loading={loading} dataSource={leads} locale={{ emptyText: <Empty description="暂无客户主动留资" /> }} columns={[{ title: '客户', dataIndex: 'userNickname' }, { title: '联系方式', render: (_: unknown, row: any) => row.phone || row.email || '未提供' }, { title: '来源', dataIndex: 'contactSource' }, { title: '状态', dataIndex: 'status', render: (value: string, row: any) => <Select size="small" value={value} onChange={(next) => void updateStatus(row.id, next)} options={Object.entries(statusLabels).map(([v, l]) => ({ value: v, label: l }))} /> }, { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }]} /></Card>
    <Modal title="登记客户留资" open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)}><Form form={form} layout="vertical"><Form.Item name="conversationId" label="会话 ID" rules={[{ required: true, message: '请输入关联会话 ID' }]}><Input /></Form.Item><Form.Item name="phone" label="手机号"><Input /></Form.Item><Form.Item name="email" label="邮箱"><Input /></Form.Item><Form.Item name="consentVersion" label="同意记录版本" initialValue="v1"><Input /></Form.Item><Form.Item name="contactSource" label="联系方式来源" initialValue="customer_submitted"><Select options={[{ value: 'customer_submitted', label: '客户主动提交' }, { value: 'authorized', label: '客户授权' }]} /></Form.Item></Form></Modal>
  </div>;
};

export default LeadsList;
