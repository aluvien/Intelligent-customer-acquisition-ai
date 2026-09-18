import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Descriptions, Empty, Form, Input, List, Modal, Select, Space, Spin, Table, Typography, message } from 'antd';
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [followupForm] = Form.useForm();

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

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true);
    try { const response = await api.get(`/leads/${id}`); setDetail(response.data.data); }
    catch (err: any) { setDetailOpen(false); message.error(err?.response?.data?.message || '线索详情加载失败'); }
    finally { setDetailLoading(false); }
  };

  const updateStatus = async (id: string, nextStatus: string) => {
    try { await api.patch(`/leads/${id}`, { status: nextStatus }); await load(); }
    catch (err: any) { message.error(err?.response?.data?.message || '线索更新失败'); }
  };

  const addFollowup = async () => {
    if (!detail?.lead?.id) return;
    try {
      const values = await followupForm.validateFields();
      const response = await api.post(`/leads/${detail.lead.id}/followups`, values);
      setDetail((current: any) => current ? { ...current, followups: [response.data.data.followup, ...(current.followups || [])] } : current);
      followupForm.resetFields();
      message.success('跟进记录已保存');
    } catch (err: any) { if (!err?.errorFields) message.error(err?.response?.data?.message || '跟进记录保存失败'); }
  };

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<ContactsOutlined />} title="线索中心" subtitle="线索只来自客户主动提供或授权的联系方式" extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>登记线索</Button></Space>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="真实线索"><Space style={{ marginBottom: 16 }}><Select value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} style={{ width: 130 }} /></Space><Table rowKey="id" loading={loading} dataSource={leads} onRow={(record) => ({ onClick: () => void openDetail(record.id), style: { cursor: 'pointer' } })} locale={{ emptyText: <Empty description="暂无客户主动留资" /> }} columns={[{ title: '客户', dataIndex: 'userNickname' }, { title: '联系方式', render: (_: unknown, row: any) => row.phone || row.email || '未提供' }, { title: '来源', dataIndex: 'contactSource' }, { title: '状态', dataIndex: 'status', render: (value: string, row: any) => <Select size="small" value={value} onClick={(event) => event.stopPropagation()} onChange={(next) => void updateStatus(row.id, next)} options={Object.entries(statusLabels).map(([v, l]) => ({ value: v, label: l }))} /> }, { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }]} /></Card>
    <Modal title="登记客户留资" open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)}><Form form={form} layout="vertical"><Form.Item name="conversationId" label="会话 ID" rules={[{ required: true, message: '请输入关联会话 ID' }]}><Input /></Form.Item><Form.Item name="phone" label="手机号"><Input /></Form.Item><Form.Item name="email" label="邮箱"><Input /></Form.Item><Form.Item name="consentVersion" label="同意记录版本" initialValue="v1"><Input /></Form.Item><Form.Item name="contactSource" label="联系方式来源" initialValue="customer_submitted"><Select options={[{ value: 'customer_submitted', label: '客户主动提交' }, { value: 'authorized', label: '客户授权' }]} /></Form.Item><Form.Item name="consentConfirmed" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('请确认客户已同意')) }]}><Checkbox>客户已同意由本企业联系</Checkbox></Form.Item></Form></Modal>
    <Modal title={detail?.lead ? `线索详情 · ${detail.lead.userNickname}` : '线索详情'} open={detailOpen} footer={null} onCancel={() => setDetailOpen(false)}>{detailLoading ? <Spin /> : detail?.lead ? <><Descriptions bordered size="small" column={1}><Descriptions.Item label="联系方式">{detail.lead.phone || detail.lead.email || '未提供'}</Descriptions.Item><Descriptions.Item label="来源">{detail.lead.contactSource || '未记录'}</Descriptions.Item><Descriptions.Item label="同意记录">{detail.lead.consentVersion || '未记录'} · {detail.lead.consentAt ? new Date(detail.lead.consentAt).toLocaleString() : '未记录'}</Descriptions.Item><Descriptions.Item label="状态">{statusLabels[detail.lead.status] || detail.lead.status}</Descriptions.Item><Descriptions.Item label="备注">{detail.lead.notes || '无'}</Descriptions.Item></Descriptions><Typography.Title level={5} style={{ marginTop: 20 }}>跟进记录</Typography.Title><List size="small" dataSource={detail.followups || []} locale={{ emptyText: '暂无跟进记录' }} renderItem={(item: any) => <List.Item><List.Item.Meta title={`${item.action} · ${new Date(item.createdAt).toLocaleString()}`} description={item.note} /></List.Item>} /><Form form={followupForm} layout="inline" style={{ marginTop: 16 }}><Form.Item name="action" rules={[{ required: true, message: '请输入动作' }]}><Input placeholder="动作，如电话联系" /></Form.Item><Form.Item name="note" rules={[{ required: true, message: '请输入备注' }]}><Input placeholder="跟进备注" /></Form.Item><Button type="primary" onClick={() => void addFollowup()}>记录跟进</Button></Form></> : null}</Modal>
  </div>;
};

export default LeadsList;
