import React, { useState, useEffect } from 'react';
import { Modal, Table, Empty, Typography } from '@douyinfe/semi-ui';
import { Users } from 'lucide-react';
import { API, renderQuota } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const { Text } = Typography;

const InviteeListModal = ({ visible, onCancel, t }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isMobile = useIsMobile();

  const loadInvitees = async (currentPage, currentPageSize) => {
    setLoading(true);
    const res = await API.get(
      `/api/user/aff/invitees?p=${currentPage}&page_size=${currentPageSize}`,
    );
    const { success, data } = res.data;
    if (success) {
      setItems(data?.items || []);
      setTotal(data?.total || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      loadInvitees(page, pageSize);
    }
  }, [visible, page, pageSize]);

  const handlePageChange = (currentPage) => {
    setPage(currentPage);
  };

  const handlePageSizeChange = (currentPageSize) => {
    setPageSize(currentPageSize);
    setPage(1);
  };

  const columns = [
    {
      title: t('用户名'),
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: t('邀请时间'),
      dataIndex: 'invited_at',
      key: 'invited_at',
      render: (_, record) => {
        const value = record?.invited_at || record?.created_at || 0;
        if (!value) return '-';
        const date = new Date(value * 1000);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      },
    },
    {
      title: t('累计贡献'),
      dataIndex: 'total_commission',
      key: 'total_commission',
      render: (value) => renderQuota(value || 0),
    },
  ];

  return (
    <Modal
      title={
        <div className='flex items-center gap-2'>
          <Users size={16} />
          <span>{t('邀请记录')}</span>
        </div>
      }
      visible={visible}
      onCancel={onCancel}
      footer={null}
      size={isMobile ? 'full-width' : 'large'}
    >
      <Table
        columns={columns}
        dataSource={items}
        loading={loading}
        rowKey='id'
        pagination={{
          currentPage: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOpts: [10, 20, 50],
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
        }}
        size='small'
        empty={<Empty description={t('暂无邀请记录')} />}
      />
    </Modal>
  );
};

export default InviteeListModal;
