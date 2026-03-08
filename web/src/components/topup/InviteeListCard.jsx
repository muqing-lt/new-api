import React from 'react';
import { Typography, Card, Table, Empty, Button } from '@douyinfe/semi-ui';
import { Users, ExternalLink } from 'lucide-react';
import { renderQuota } from '../../helpers';

const { Text } = Typography;

const InviteeListCard = ({ t, inviteeData, loading, onViewAll }) => {
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

  const items = inviteeData?.items || [];
  const total = inviteeData?.total || 0;
  // 只显示前 3 条
  const previewItems = items.slice(0, 3);

  return (
    <Card
      className='!rounded-xl w-full'
      title={
        <div className='flex items-center gap-2'>
          <Users size={16} />
          <Text>{t('邀请记录')}</Text>
        </div>
      }
    >
      <Table
        columns={columns}
        dataSource={previewItems}
        loading={loading}
        pagination={false}
        empty={<Empty description={t('暂无邀请记录')} />}
        size='small'
      />
      {total > 3 && (
        <div className='flex justify-center mt-3'>
          <Button
            type='tertiary'
            theme='light'
            onClick={onViewAll}
            icon={<ExternalLink size={14} />}
            iconPosition='right'
          >
            {t('查看全部邀请记录')}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default InviteeListCard;
