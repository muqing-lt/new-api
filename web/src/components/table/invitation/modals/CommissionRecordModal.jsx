import React, { useState, useEffect } from 'react';
import { Modal, Table, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota } from '../../../../helpers';
import dayjs from 'dayjs';

const CommissionRecordModal = ({ visible, onCancel, user }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const loadRecords = async (p) => {
    if (!user) return;
    setLoading(true);
    const res = await API.get(
      `/api/user/aff/${user.id}/records?p=${p}&page_size=${pageSize}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const items = data.items || [];
      setRecords(items.map((item) => ({ ...item, key: item.id })));
      setTotal(data.total);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible && user) {
      setPage(1);
      loadRecords(1);
    }
  }, [visible, user]);

  const handlePageChange = (p) => {
    setPage(p);
    loadRecords(p);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: t('被邀请人'),
      dataIndex: 'invitee_username',
      render: (text, record) => text || `#${record.invitee_id}`,
    },
    {
      title: t('消费金额'),
      dataIndex: 'consume_quota',
      render: (text) => (
        <Tag color='blue' shape='circle'>
          {renderQuota(text)}
        </Tag>
      ),
    },
    {
      title: t('返佣比例'),
      dataIndex: 'rate',
      render: (text) => `${text}%`,
    },
    {
      title: t('佣金'),
      dataIndex: 'commission',
      render: (text) => (
        <Tag color='green' shape='circle'>
          {renderQuota(text)}
        </Tag>
      ),
    },
    {
      title: t('时间'),
      dataIndex: 'created_at',
      render: (text) =>
        text > 0 ? dayjs.unix(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
  ];

  return (
    <Modal
      title={`${t('返佣记录')} - ${user?.username || ''}`}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
      bodyStyle={{ padding: '12px 24px' }}
    >
      <Table
        columns={columns}
        dataSource={records}
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

export default CommissionRecordModal;
