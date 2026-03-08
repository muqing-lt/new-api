import React, { useState, useEffect } from 'react';
import { Modal, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota } from '../../../../helpers';
import dayjs from 'dayjs';

const { Paragraph } = Typography;

const InviteeListModal = ({ visible, onCancel, user }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [invitees, setInvitees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const loadInvitees = async (p) => {
    if (!user) return;
    setLoading(true);
    const res = await API.get(
      `/api/user/aff/${user.id}/invitees?p=${p}&page_size=${pageSize}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const items = data.items || [];
      setInvitees(items.map((item, i) => ({ ...item, key: item.id || i })));
      setTotal(data.total);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible && user) {
      setPage(1);
      loadInvitees(1);
    }
  }, [visible, user]);

  const handlePageChange = (p) => {
    setPage(p);
    loadInvitees(p);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: t('用户名'),
      dataIndex: 'username',
      render: (text) => (
        <Paragraph copyable={{ content: text }} style={{ marginBottom: 0 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: t('累计贡献佣金'),
      dataIndex: 'total_commission',
      render: (text) => (
        <Tag color='green' shape='circle'>
          {renderQuota(text)}
        </Tag>
      ),
    },
    {
      title: t('首次佣金时间'),
      dataIndex: 'created_at',
      render: (text) =>
        text > 0 ? dayjs.unix(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
  ];

  return (
    <Modal
      title={`${t('被邀请人列表')} - ${user?.username || ''}`}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={700}
      bodyStyle={{ padding: '12px 24px' }}
    >
      <Table
        columns={columns}
        dataSource={invitees}
        loading={loading}
        pagination={{
          currentPage: page,
          pageSize: pageSize,
          total: total,
          onPageChange: handlePageChange,
        }}
        size='small'
      />
    </Modal>
  );
};

export default InviteeListModal;
