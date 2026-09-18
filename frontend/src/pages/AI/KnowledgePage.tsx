import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Table, Tag, message } from 'antd';
import { BookOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import BusinessPageHeader from '../../components/BusinessPageHeader';

type Document = {
  id: string;
  title: string;
  content: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  updatedAt: string;
};

const statusLabels: Record<Document['status'], string> = { draft: '草稿', published: '已发布', archived: '已归档' };

const KnowledgePage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/ai/knowledge');
      setDocuments(response.data.data.documents || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || '知识库加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openEditor = (document?: Document) => {
    setEditing(document || null);
    form.setFieldsValue(document ? { title: document.title, content: document.content } : { title: '', content: '' });
    setModalOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing) await api.patch(`/ai/knowledge/${editing.id}`, values);
      else await api.post('/ai/knowledge', values);
      message.success('知识文档已保存为草稿');
      setModalOpen(false);
      await load();
    } catch (err: any) {
      if (!err?.errorFields) message.error(err?.response?.data?.message || '知识文档保存失败');
    }
  };

  const publish = async (id: string) => {
    try { await api.post(`/ai/knowledge/${id}/publish`); message.success('知识文档已发布'); await load(); }
    catch (err: any) { message.error(err?.response?.data?.message || '知识文档发布失败'); }
  };

  const archive = async (id: string) => {
    try { await api.delete(`/ai/knowledge/${id}`); message.success('知识文档已归档'); await load(); }
    catch (err: any) { message.error(err?.response?.data?.message || '知识文档归档失败'); }
  };

  return <div style={{ padding: '4px 0' }}>
    <BusinessPageHeader icon={<BookOutlined />} title="知识库管理" subtitle="只有已发布的企业知识会作为 AI 草稿依据" extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新建知识</Button></Space>} />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Card title="企业知识文档">
      {loading && !documents.length ? <Spin /> : <Table rowKey="id" loading={loading} dataSource={documents} locale={{ emptyText: <Empty description="暂无知识文档" /> }} columns={[
        { title: '标题', dataIndex: 'title' },
        { title: '版本', dataIndex: 'version' },
        { title: '状态', dataIndex: 'status', render: (value: Document['status']) => <Tag color={value === 'published' ? 'success' : value === 'archived' ? 'default' : 'processing'}>{statusLabels[value]}</Tag> },
        { title: '更新时间', dataIndex: 'updatedAt', render: (value: string) => new Date(value).toLocaleString() },
        { title: '操作', render: (_: unknown, row: Document) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(row)} disabled={row.status === 'archived'}>编辑</Button>{row.status === 'draft' && <Button size="small" type="primary" onClick={() => void publish(row.id)}>发布</Button>}{row.status !== 'archived' && <Popconfirm title="归档后不再作为 AI 依据，确认继续？" onConfirm={() => void archive(row.id)}><Button size="small" danger>归档</Button></Popconfirm>}</Space> },
      ]} />}
    </Card>
    <Modal title={editing ? '编辑知识文档' : '新建知识文档'} open={modalOpen} onOk={() => void save()} onCancel={() => setModalOpen(false)} width={720} okText="保存草稿">
      <Form form={form} layout="vertical"><Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input maxLength={200} /></Form.Item><Form.Item name="content" label="内容" rules={[{ required: true, min: 50, message: '内容至少 50 个字符' }]}><Input.TextArea rows={12} maxLength={50000} showCount /></Form.Item></Form>
    </Modal>
  </div>;
};

export default KnowledgePage;
